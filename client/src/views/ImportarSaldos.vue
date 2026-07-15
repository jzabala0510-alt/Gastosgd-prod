<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Importar saldos desde Excel</h1>
        <p class="page__hint">
          Sube el archivo Excel diario de saldos para cargar los montos automáticamente.
          Los alias de tienda deben estar configurados en <b>Admin → Alias de tiendas</b>.
        </p>
      </div>
    </div>

    <!-- PASO 1: Subir archivo ------------------------------------------------ -->
    <div class="card">
      <label class="uploader__drop">
        <input type="file" accept=".xlsx,.xls" hidden @change="onArchivo" />
        <span class="uploader__icon">📊</span>
        <span class="uploader__droptext">
          <b>{{ archivoNombre || 'Haz clic para seleccionar el Excel de saldos' }}</b>
          <small>Hojas "BANCO TIENDAS…" · Solo montos en Bs · La fecha se extrae del nombre de la hoja</small>
        </span>
      </label>
    </div>

    <div v-if="parseError" class="card imp-warn"><b>Error al leer el archivo:</b> {{ parseError }}</div>

    <!-- PASO 2: Selector de día (si hay múltiples hojas) -------------------- -->
    <div v-if="hojas.length > 1 && !importado" class="card filtros">
      <div class="field">
        <label>Día a importar</label>
        <select v-model="hojaSeleccionada" @change="onHojaSelect">
          <option value="">Selecciona un día…</option>
          <option v-for="h in hojas" :key="h.nombre" :value="h.nombre">
            {{ h.fechaDisplay }} — {{ h.nombre }}
          </option>
        </select>
      </div>
    </div>

    <!-- Fecha manual: cuando no se pudo parsear del nombre de hoja ---------- -->
    <div v-if="filasExcel.length && !hojaFecha && !importado" class="card filtros">
      <div class="field">
        <label>Fecha del saldo</label>
        <input type="date" v-model="fechaManual" />
        <small style="color:var(--muted)">No se pudo determinar la fecha desde el nombre de la hoja.</small>
      </div>
    </div>

    <!-- Barra de estado: listo para preview --------------------------------- -->
    <div v-if="filasExcel.length && !previewData && !importado" class="seleccion-bar">
      <span>{{ filasExcel.length }} tiendas encontradas</span>
      <span v-if="fechaActiva">Fecha: <b>{{ hojaFechaDisplay }}</b></span>
      <span v-if="totalExcelGeneral">Total Excel: <b>{{ money(totalExcelGeneral) }} Bs</b></span>
      <button class="btn btn--primary" :disabled="generando || !fechaActiva" @click="generarPreview">
        {{ generando ? 'Procesando…' : 'Ver preview' }}
      </button>
    </div>

    <!-- PASO 3: Preview ----------------------------------------------------- -->
    <template v-if="previewData && !importado">

      <div class="seleccion-bar">
        <span>Fecha: <b>{{ hojaFechaDisplay }}</b></span>
        <span v-if="previewData.noResueltas.length" class="badge badge--amber">
          ⚠ {{ previewData.noResueltas.length }} sin alias
        </span>
        <span v-if="previewData.sobreescribe" class="badge badge--amber">
          Sobreescribirá datos existentes
        </span>
        <button class="btn" @click="previewData = null">← Volver</button>
        <button
          class="btn btn--primary"
          :disabled="importando || !previewData.items.length"
          @click="confirmar"
        >
          {{ importando ? 'Importando…' : 'Confirmar importación' }}
        </button>
      </div>

      <!-- Tiendas sin alias: aviso + lista ---------------------------------- -->
      <div v-if="previewData.noResueltas.length" class="card imp-warn">
        <b>{{ previewData.noResueltas.length }} tienda(s) sin alias — serán omitidas:</b>
        <ul class="imp-warn__list">
          <li v-for="nr in previewData.noResueltas" :key="nr.fila">
            Fila {{ nr.fila }}: {{ nr.rs2 || nr.rs1 }}
          </li>
        </ul>
        <span style="font-size:13px;margin-top:8px;display:block">
          Para incluirlas, configúralas en <b>Admin → Alias de tiendas</b> y vuelve a generar el preview.
        </span>
      </div>

      <!-- Resumen por banco -------------------------------------------------- -->
      <div class="card">
        <h2 style="font-size:15px;margin:0 0 12px">
          Resumen por banco — {{ hojaFechaDisplay }}
        </h2>
        <div class="table-wrap">
          <table class="grid">
            <thead>
              <tr>
                <th>Banco</th>
                <th class="r">Total Bs</th>
                <th class="r">Registros</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in resumenBancos" :key="b.idBanco">
                <td>{{ b.banco }}</td>
                <td class="r"><b>{{ money(b.total) }}</b></td>
                <td class="r">{{ b.count }}</td>
                <td>
                  <span v-if="b.sobreescribe" class="badge badge--amber">Actualizará</span>
                  <span v-else class="badge badge--green">Nuevo</span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td><b>TOTAL</b></td>
                <td class="r"><b>{{ money(previewData.totalImportar) }}</b></td>
                <td class="r">{{ previewData.items.length }}</td>
                <td>
                  <span
                    v-if="previewData.totalExcel && Math.abs(difTotal) > 0.5"
                    class="badge badge--red"
                  >
                    Dif. vs Excel: {{ money(Math.abs(difTotal)) }}
                  </span>
                  <span v-else-if="previewData.totalExcel" class="badge badge--green">
                    Coincide con Excel ✓
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div v-if="!previewData.items.length" class="page__hint" style="margin-top:12px">
          Sin registros para importar. Verifica que los alias estén configurados.
        </div>

        <div v-else style="margin-top:14px">
          <button
            class="btn btn--primary"
            :disabled="importando"
            @click="confirmar"
          >
            {{ importando ? 'Importando…' : `Confirmar importación del ${hojaFechaDisplay}` }}
          </button>
        </div>
      </div>
    </template>

    <!-- PASO 4: Éxito ------------------------------------------------------- -->
    <div v-if="importado" class="card imp-ok">
      <div class="imp-ok__icon">✓</div>
      <h2 class="imp-ok__titulo">Importación completada</h2>
      <p class="imp-ok__sub">
        <b>{{ importado.guardadas }}</b> registros guardados para el <b>{{ hojaFechaDisplay }}</b>.
      </p>
      <button class="btn btn--primary imp-ok__btn" @click="reiniciar">
        Importar otro día
      </button>
    </div>

    <ModalFeedback
      :visible="modal.visible"
      :titulo="modal.titulo"
      :mensaje="modal.mensaje"
      :tipo="modal.tipo"
      @close="modal.visible = false"
    />
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import * as XLSX from 'xlsx';
import ModalFeedback from '../components/ModalFeedback.vue';
import { previewImport } from '../api/importarSaldos';
import { guardarFondos } from '../api/fondos';
import { money } from '../utils/format';

// ── Estado ────────────────────────────────────────────────────────────────────
const archivoNombre = ref('');
const hojas = ref([]);          // [{nombre, fecha:'YYYY-MM-DD', fechaDisplay:'DD/MM/YYYY'}]
const hojaSeleccionada = ref('');
const hojaFecha = ref('');      // 'YYYY-MM-DD' parseada del nombre de hoja
const fechaManual = ref('');    // fallback cuando la hoja no trae fecha parseable
const filasExcel = ref([]);     // [{fila, rs1, rs2, bancos:{encabezado:monto}}]
const totalExcelGeneral = ref(0);
const parseError = ref('');
const generando = ref(false);
const previewData = ref(null);
const importando = ref(false);
const importado = ref(null);    // {guardadas:N}
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });

let wbRef = null; // workbook en memoria para re-parsear si cambia la hoja seleccionada

// ── Computed ──────────────────────────────────────────────────────────────────
const fechaActiva = computed(() => hojaFecha.value || fechaManual.value);

const hojaFechaDisplay = computed(() => {
  const f = fechaActiva.value;
  if (!f) return '—';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
});

const resumenBancos = computed(() => {
  if (!previewData.value) return [];
  const acc = {};
  for (const it of previewData.value.items) {
    if (!acc[it.idBanco]) {
      acc[it.idBanco] = { idBanco: it.idBanco, banco: it.banco, total: 0, count: 0, sobreescribe: false };
    }
    acc[it.idBanco].total += it.monto;
    acc[it.idBanco].count++;
    if (it.sobreescribe) acc[it.idBanco].sobreescribe = true;
  }
  return Object.values(acc).sort((a, b) => b.total - a.total);
});

const difTotal = computed(() => {
  if (!previewData.value?.totalExcel) return 0;
  return previewData.value.totalExcel - previewData.value.totalImportar;
});

// ── Helpers de parseo ─────────────────────────────────────────────────────────

/** Extrae fecha ISO de "BANCO TIENDAS 01-07-2026" o "BANCO TIENDAS 01-07". */
function parsearFechaHoja(nombre) {
  const m = nombre.match(/(\d{2})-(\d{2})(?:-(\d{4}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const year = yyyy || String(new Date().getFullYear());
  return `${year}-${mm}-${dd}`;
}

function toFechaDisplay(iso) {
  if (!iso) return iso;
  const [y, mo, d] = iso.split('-');
  return `${d}/${mo}/${y}`;
}

/**
 * Parsea una hoja del workbook y devuelve las filas de datos + el total declarado por el Excel.
 *
 * Estrategia de encabezados: busca la primera fila donde la columna 6 tenga texto (cubre
 * el caso de Excel con fila de título antes de los encabezados reales).
 * Columnas de banco: todas las col 6+ cuyo encabezado NO empiece con "TOTAL".
 * El encabezado crudo se manda al server tal cual; el server normaliza y busca en GD_BancoAlias.
 */
function parsearHoja(wb, nombreHoja) {
  const filas2d = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: true, defval: null });
  const str = (v) => (v == null ? '' : String(v).trim());

  // Encontrar fila de encabezados
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(5, filas2d.length); r++) {
    if (str(filas2d[r]?.[6])) { headerRowIdx = r; break; }
  }
  const headerRow = filas2d[headerRowIdx] || [];
  const dataStart = headerRowIdx + 1;

  // Separar columnas de banco de la columna "Total General"
  const bancoCols = []; // [{idx, header}]
  let totalColIdx = -1;
  for (let c = 6; c < headerRow.length; c++) {
    const h = str(headerRow[c]);
    if (!h) continue;
    if (h.toUpperCase().startsWith('TOTAL')) {
      totalColIdx = c;
    } else {
      bancoCols.push({ idx: c, header: h });
    }
  }

  // ── DIAGNÓSTICO TEMPORAL (remover cuando se resuelva la discrepancia de totales) ──
  console.log('[GD-Import] Hoja:', nombreHoja);
  console.log('[GD-Import] headerRowIdx:', headerRowIdx, '| dataStart:', dataStart);
  console.log('[GD-Import] Fila de encabezados (cols 0-20):',
    (filas2d[headerRowIdx] || []).slice(0, 21).map((v, i) => `[${i}]="${v ?? ''}"`).join('  ')
  );
  console.log('[GD-Import] Columnas de banco detectadas:',
    bancoCols.map((c) => `col${c.idx}:"${c.header}"`).join(' | ')
  );
  console.log('[GD-Import] Columna TOTAL:',
    totalColIdx >= 0
      ? `col${totalColIdx} = "${str(filas2d[headerRowIdx]?.[totalColIdx])}"`
      : 'NO ENCONTRADA'
  );
  // ── fin diagnóstico ─────────────────────────────────────────────────────────────

  const filas = [];
  let totalExcel = 0;
  let filasSubtotal = 0;
  let filasVacias = 0;

  for (let i = dataStart; i < filas2d.length; i++) {
    const row = filas2d[i] || [];
    const rs1 = str(row[4]);
    const rs2 = str(row[5]);
    if (!rs1 && !rs2) { filasVacias++; continue; }

    const txt = `${rs2} ${rs1}`.trim().toUpperCase();

    if (txt.startsWith('TOTAL')) {
      filasSubtotal++;
      if (!txt.includes('ZONA')) {
        // Fila "Total General": capturar monto y DETENER el parseo.
        // El Excel tiene una segunda sección de resumen después de esta fila;
        // si continuáramos procesando, esos montos se sumarían encima de los individuales.
        if (totalColIdx >= 0) {
          const v = Number(row[totalColIdx]);
          if (Number.isFinite(v) && v > 0) totalExcel = v;
        }
        if (!totalExcel) {
          let sum = 0;
          for (const { idx } of bancoCols) {
            const v = Number(row[idx]);
            if (Number.isFinite(v)) sum += v;
          }
          if (sum > 0) totalExcel = sum;
        }
        console.log(`[GD-Import] Fila ${i + 1} TOTAL-GENERAL → totalExcel=${totalExcel}, deteniendo parseo`);
        break; // Nada válido después del Total General
      }
      console.log(`[GD-Import] Fila ${i + 1} SUBTOTAL-ZONA (skipped): "${txt}"`);
      continue; // TOTAL ZONA: saltar y seguir con la misma sección
    }

    // Fila de datos: extraer montos por encabezado de banco
    const bancos = {};
    for (const { idx, header } of bancoCols) {
      const v = row[idx];
      if (v != null && v !== '') {
        const n = Number(v);
        if (Number.isFinite(n) && n !== 0) bancos[header] = n;
      }
    }
    if (!Object.keys(bancos).length) { filasVacias++; continue; } // fila de tienda sin ningún saldo

    filas.push({ fila: i + 1, rs1, rs2, bancos });
  }

  // ── Resumen de diagnóstico ───────────────────────────────────────────────────
  console.log(`[GD-Import] RESUMEN: datos=${filas.length} subtotales=${filasSubtotal} vacías=${filasVacias} totalExcel=${totalExcel}`);
  // Muestreo: primeras 3 filas de datos
  filas.slice(0, 3).forEach((f) => {
    console.log(`[GD-Import] Fila ${f.fila} rs2="${f.rs2}" rs1="${f.rs1}" bancos:`, JSON.stringify(f.bancos));
  });
  // ────────────────────────────────────────────────────────────────────────────

  return { filas, totalExcel };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function onArchivo(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  // Reset completo
  archivoNombre.value = file.name;
  hojas.value = [];
  hojaSeleccionada.value = '';
  hojaFecha.value = '';
  fechaManual.value = '';
  filasExcel.value = [];
  totalExcelGeneral.value = 0;
  previewData.value = null;
  importado.value = null;
  parseError.value = '';
  wbRef = null;

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    wbRef = wb;

    // Detectar todas las hojas "BANCO TIENDAS…"
    const detectadas = wb.SheetNames
      .filter((n) => n.trim().toUpperCase().startsWith('BANCO TIENDAS'))
      .map((nombre) => {
        const fecha = parsearFechaHoja(nombre);
        return { nombre, fecha, fechaDisplay: fecha ? toFechaDisplay(fecha) : nombre };
      });

    if (!detectadas.length) {
      parseError.value = 'No se encontró ninguna hoja "BANCO TIENDAS…" en el archivo.';
      return;
    }

    hojas.value = detectadas;

    if (detectadas.length === 1) {
      // Una sola hoja: auto-seleccionar y parsear
      hojaSeleccionada.value = detectadas[0].nombre;
      onHojaSelect();
    }
    // Con múltiples hojas el selector aparece; el usuario elige y onHojaSelect() se llama desde el @change
  } catch {
    parseError.value = 'No se pudo leer el archivo. ¿Es un .xlsx válido?';
  }
}

function onHojaSelect() {
  if (!hojaSeleccionada.value || !wbRef) return;
  const hoja = hojas.value.find((h) => h.nombre === hojaSeleccionada.value);
  hojaFecha.value = hoja?.fecha || '';
  fechaManual.value = '';
  previewData.value = null;
  importado.value = null;
  parseError.value = '';

  try {
    const { filas, totalExcel } = parsearHoja(wbRef, hojaSeleccionada.value);
    if (!filas.length) {
      parseError.value = 'La hoja seleccionada no tiene filas de tienda con montos.';
      filasExcel.value = [];
      return;
    }
    filasExcel.value = filas;
    totalExcelGeneral.value = totalExcel;
  } catch {
    parseError.value = 'Error al parsear la hoja seleccionada.';
    filasExcel.value = [];
  }
}

async function generarPreview() {
  generando.value = true;
  previewData.value = null;
  try {
    const data = await previewImport({
      fecha: fechaActiva.value,
      totalExcel: totalExcelGeneral.value || null,
      filas: filasExcel.value,
    });
    previewData.value = data;
  } catch (e) {
    modal.value = { visible: true, titulo: 'Error', mensaje: e.response?.data?.error || 'No se pudo generar el preview.', tipo: 'error' };
  } finally {
    generando.value = false;
  }
}

async function confirmar() {
  importando.value = true;
  try {
    const items = previewData.value.items.map(({ codTienda, idBanco, monto }) => ({ codTienda, idBanco, monto }));
    const r = await guardarFondos({ fecha: fechaActiva.value, items });
    importado.value = r;
    previewData.value = null;
  } catch (e) {
    modal.value = { visible: true, titulo: 'Error', mensaje: e.response?.data?.error || 'No se pudieron guardar los saldos.', tipo: 'error' };
  } finally {
    importando.value = false;
  }
}

function reiniciar() {
  archivoNombre.value = '';
  hojas.value = [];
  hojaSeleccionada.value = '';
  hojaFecha.value = '';
  fechaManual.value = '';
  filasExcel.value = [];
  totalExcelGeneral.value = 0;
  previewData.value = null;
  importado.value = null;
  parseError.value = '';
  wbRef = null;
}
</script>

<style scoped>
.imp-warn {
  border-left: 4px solid #f59e0b;
  background: #fffbeb;
  color: #78350f;
  font-size: 14px;
}
.imp-warn__list {
  margin: 8px 0 8px 18px;
  padding: 0;
  font-size: 13px;
  color: #92400e;
  max-height: 180px;
  overflow-y: auto;
}
.imp-ok {
  text-align: center;
  padding: 48px 24px;
}
.imp-ok__icon {
  font-size: 56px;
  color: #16a34a;
  margin-bottom: 8px;
}
.imp-ok__titulo {
  margin: 0 0 8px;
  font-size: 22px;
}
.imp-ok__sub {
  color: var(--muted);
  margin: 0 0 20px;
}
.imp-ok__btn { margin-top: 4px; }
</style>
