<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Alias de tiendas</h1>
        <p class="page__hint">Resuelve, una sola vez, qué tienda del ERP corresponde a cada nombre del Excel de saldos. Una vez confirmado, no se vuelve a preguntar.</p>
      </div>
    </div>

    <div class="alias-tabs">
      <button class="alias-tab" :class="{ on: tab === 'revisar' }" @click="tab = 'revisar'">Revisar Excel</button>
      <button class="alias-tab" :class="{ on: tab === 'confirmados' }" @click="cambiarAConfirmados">Alias confirmados</button>
    </div>

    <!-- ── Pestaña: Revisar Excel ─────────────────────────────────────── -->
    <template v-if="tab === 'revisar'">
      <div class="card">
        <label class="uploader__drop">
          <input type="file" accept=".xlsx,.xls" hidden @change="onArchivo" />
          <span class="uploader__icon">📄</span>
          <span class="uploader__droptext">
            <b>{{ archivoNombre || 'Haz clic para seleccionar el Excel de saldos' }}</b>
            <small>Se lee la hoja "BANCO TIENDAS…" (solo nombres de tienda, no montos)</small>
          </span>
        </label>
        <button class="btn btn--primary uploader__btn" :class="{ 'btn--pulse': filasExcel.length && !generando }"
                :disabled="!filasExcel.length || generando" @click="generarSugerencias">
          {{ generando ? 'Analizando…' : `Generar sugerencias (${filasExcel.length} filas)` }}
        </button>
      </div>

      <template v-if="resumen">
        <div class="seleccion-bar">
          <span>Total: <b>{{ resumen.total }}</b></span>
          <span class="badge badge--green">Ya confirmado: {{ resumen.yaConfirmado }}</span>
          <span class="badge badge--gray">Ya ignorado: {{ resumen.yaIgnorado }}</span>
          <span class="badge badge--green">Exacta: {{ resumen.exacta }}</span>
          <span class="badge badge--green">Fuerte: {{ resumen.fuerte }}</span>
          <span class="badge badge--amber">Dudosa: {{ resumen.dudosa }}</span>
          <span class="badge badge--red">Sin match: {{ resumen.sinMatch }}</span>
        </div>

        <div class="card filtros">
          <button class="btn btn--primary btn--sm" :disabled="!resumen.exacta || confirmandoLote" @click="confirmarLote('EXACTA')">
            Confirmar automáticamente las {{ resumen.exacta }} EXACTA
          </button>
          <button class="btn btn--sm" :disabled="!resumen.fuerte || confirmandoLote" @click="confirmarLote('FUERTE')">
            Aceptar las {{ resumen.fuerte }} FUERTE sugeridas
          </button>
          <div class="field" style="margin-left:auto; max-width:220px">
            <label>Mostrar</label>
            <select v-model="filtro">
              <option value="pendientes">Pendientes por revisar</option>
              <option value="todas">Todas</option>
            </select>
          </div>
        </div>

        <div class="table-wrap"><table class="grid">
          <thead>
            <tr>
              <th>Fila</th><th>Zona / Grupo / Marca (Excel)</th><th>Nombre Excel</th><th>Estado</th><th class="r">Score</th>
              <th>Sugerencia ERP</th><th>Corregir</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in filasVisibles" :key="f.fila" :class="{ sel: decisiones[f.fila] }">
              <td>{{ f.fila }}</td>
              <td>{{ f.zona }}<br /><small class="txt-muted">{{ f.grupo }} · {{ f.marca }}</small></td>
              <td><b>{{ f.rs2 || '—' }}</b><br /><small class="txt-muted">{{ f.rs1 }}</small></td>
              <td><span class="badge" :class="claseEstado(f.estado)">{{ etiquetaEstado(f.estado) }}</span></td>
              <td class="r">{{ f.score ?? '—' }}</td>
              <td>
                <template v-if="f.tienda">{{ f.tienda }}<br /><small class="txt-muted">{{ f.zonaErp || 'NACIONALES' }} · {{ f.grupoErp }} · {{ f.marcaErp }}</small></template>
                <span v-else class="txt-muted">Sin candidata</span>
              </td>
              <td>
                <BuscadorTienda v-if="puedeDecidir(f.estado)" :tiendas="tiendasCatalogo"
                  :model-value="decisiones[f.fila]?.codTienda ?? f.codTienda"
                  @update:model-value="(cod) => marcarConfirmar(f, cod)" />
              </td>
              <td class="acciones-inline">
                <template v-if="puedeDecidir(f.estado)">
                  <button v-if="f.codTienda" class="btn btn--sm btn--primary" @click="marcarConfirmar(f, f.codTienda)">Aceptar sugerido</button>
                  <button class="btn btn--sm btn--danger" @click="marcarIgnorar(f)">No es tienda</button>
                </template>
                <span v-else-if="decisiones[f.fila]" class="badge badge--green">Pendiente de guardar</span>
                <span v-else class="txt-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table></div>
        <p v-if="!filasVisibles.length" class="page__hint">Sin filas para mostrar con este filtro.</p>

        <div style="margin-top:14px">
          <button class="btn btn--primary" :disabled="!totalDecisiones || guardando" @click="guardarDecisiones">
            {{ guardando ? 'Guardando…' : `Guardar decisiones (${totalDecisiones})` }}
          </button>
        </div>
      </template>
    </template>

    <!-- ── Pestaña: Alias confirmados ─────────────────────────────────── -->
    <template v-else>
      <div class="card filtros">
        <div class="field" style="flex:2">
          <label>Buscar</label>
          <input v-model="buscarConfirmados" placeholder="Nombre del Excel o tienda…" />
        </div>
      </div>
      <p v-if="cargandoConfirmados" class="page__hint">Cargando…</p>
      <template v-else>
        <div class="table-wrap"><table class="grid">
          <thead>
            <tr><th>Nombre Excel</th><th>Zona/Grupo/Marca Excel</th><th>Estado</th><th>Tienda ERP</th><th>Usuario</th><th>Fecha</th><th>Corregir</th></tr>
          </thead>
          <tbody>
            <tr v-for="a in confirmadosFiltrados" :key="a.IdAlias">
              <td><b>{{ a.NombreRS2 || a.NombreRS1 || '—' }}</b><br /><small class="txt-muted">{{ a.NombreRS1 && a.NombreRS2 ? a.NombreRS1 : '' }}</small></td>
              <td>{{ a.ZonaExcel }}<br /><small class="txt-muted">{{ a.GrupoExcel }} · {{ a.MarcaExcel }}</small></td>
              <td><span class="badge" :class="a.Estado === 'CONFIRMADO' ? 'badge--green' : 'badge--gray'">{{ a.Estado }}</span></td>
              <td>
                <template v-if="a.TiendaErp">{{ a.TiendaErp }}<br /><small class="txt-muted">{{ a.ZonaErp || 'NACIONALES' }} · {{ a.GrupoErp }} · {{ a.MarcaErp }}</small></template>
                <span v-else class="txt-muted">—</span>
              </td>
              <td>{{ a.Usuario }}</td>
              <td>{{ fechaHora(a.FechaEdicion || a.FechaRegistro) }}</td>
              <td>
                <BuscadorTienda :tiendas="tiendasCatalogo" :model-value="a.CodTienda" @update:model-value="(cod) => reasignar(a, cod)" />
              </td>
            </tr>
          </tbody>
        </table></div>
        <p v-if="!confirmadosFiltrados.length" class="page__hint">Sin alias confirmados aún.</p>
      </template>
    </template>

    <ModalFeedback :visible="modal.visible" :titulo="modal.titulo" :mensaje="modal.mensaje" :tipo="modal.tipo" @close="modal.visible = false" />
  </section>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import * as XLSX from 'xlsx';
import ModalFeedback from '../components/ModalFeedback.vue';
import BuscadorTienda from '../components/BuscadorTienda.vue';
import { useConfirm } from '../composables/useConfirm';
import { sugerirAlias, confirmarAlias, getAliasConfirmados, actualizarAlias, getTiendasErp } from '../api/aliasTiendas';
import { fechaHora } from '../utils/format';

const { confirm } = useConfirm();
const tab = ref('revisar');
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });
function error(e, fallback) { modal.value = { visible: true, titulo: 'Error', mensaje: e.response?.data?.error || fallback, tipo: 'error' }; }

const tiendasCatalogo = ref([]);
onMounted(async () => { tiendasCatalogo.value = await getTiendasErp(); });

// ── Revisar Excel ────────────────────────────────────────────────────────
const archivoNombre = ref('');
const filasExcel = ref([]);
const generando = ref(false);
const resumen = ref(null);
const sugerencias = ref([]);
const filtro = ref('pendientes');
const decisiones = reactive({}); // fila -> { accion: 'CONFIRMAR'|'IGNORAR', codTienda? }
const guardando = ref(false);
const confirmandoLote = ref(false);

const ESTADO_LABEL = { YA_CONFIRMADO: 'Ya confirmado', YA_IGNORADO: 'Ya ignorado', EXACTA: 'Exacta', FUERTE: 'Fuerte', DUDOSA: 'Dudosa', SIN_MATCH: 'Sin match' };
const ESTADO_BADGE = { YA_CONFIRMADO: 'badge--green', YA_IGNORADO: 'badge--gray', EXACTA: 'badge--green', FUERTE: 'badge--green', DUDOSA: 'badge--amber', SIN_MATCH: 'badge--red' };
const etiquetaEstado = (e) => ESTADO_LABEL[e] || e;
const claseEstado = (e) => ESTADO_BADGE[e] || 'badge--gray';
const puedeDecidir = (e) => !['YA_CONFIRMADO', 'YA_IGNORADO'].includes(e);

function esSubtotal(rs1, rs2) {
  return `${rs2 || ''} ${rs1 || ''}`.trim().toUpperCase().startsWith('TOTAL');
}

async function onArchivo(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  archivoNombre.value = file.name;
  resumen.value = null; sugerencias.value = []; Object.keys(decisiones).forEach((k) => delete decisiones[k]);
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const hoja = wb.SheetNames.find((n) => n.trim().toUpperCase().startsWith('BANCO TIENDAS'));
    if (!hoja) { error({}, 'No se encontró una hoja "BANCO TIENDAS…" en el archivo.'); filasExcel.value = []; return; }
    const filas2d = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
    const str = (v) => (v == null ? '' : String(v).trim());
    const out = [];
    for (let i = 1; i < filas2d.length; i++) {
      const row = filas2d[i] || [];
      const rs1 = str(row[4]), rs2 = str(row[5]);
      if (!rs1 && !rs2) continue;
      if (esSubtotal(rs1, rs2)) continue;
      out.push({ fila: i + 1, zona: str(row[1]), grupo: str(row[2]), marca: str(row[3]), rs1, rs2 });
    }
    filasExcel.value = out;
  } catch (err) { error(err, 'No se pudo leer el archivo. ¿Es un .xlsx válido?'); filasExcel.value = []; }
}

async function generarSugerencias() {
  generando.value = true;
  try {
    const r = await sugerirAlias(filasExcel.value);
    resumen.value = r.resumen;
    sugerencias.value = r.filas;
    Object.keys(decisiones).forEach((k) => delete decisiones[k]);
  } catch (e) { error(e, 'No se pudieron generar las sugerencias.'); }
  finally { generando.value = false; }
}

const filasVisibles = computed(() => filtro.value === 'todas'
  ? sugerencias.value
  : sugerencias.value.filter((f) => puedeDecidir(f.estado)));

const totalDecisiones = computed(() => Object.keys(decisiones).length);

function marcarConfirmar(f, codTienda) {
  if (!codTienda) return;
  decisiones[f.fila] = { accion: 'CONFIRMAR', codTienda };
}
async function marcarIgnorar(f) {
  const conf = await confirm({
    titulo: 'Marcar como "no es tienda"',
    mensaje: `"${f.rs2 || f.rs1}" quedará ignorada permanentemente y no se volverá a sugerir.`,
    tipo: 'warn', labelConfirmar: 'Ignorar',
  });
  if (!conf.ok) return;
  decisiones[f.fila] = { accion: 'IGNORAR' };
}

async function guardarDecisiones() {
  const items = sugerencias.value
    .filter((f) => decisiones[f.fila])
    .map((f) => ({ ...f, ...decisiones[f.fila] }));
  if (!items.length) return;
  guardando.value = true;
  try {
    const r = await confirmarAlias(items);
    modal.value = { visible: true, titulo: 'Guardado', mensaje: `${r.confirmadas} confirmadas, ${r.ignoradas} ignoradas.`, tipo: 'success' };
    await generarSugerencias();
  } catch (e) { error(e, 'No se pudieron guardar las decisiones.'); }
  finally { guardando.value = false; }
}

async function confirmarLote(estado) {
  const items = sugerencias.value.filter((f) => f.estado === estado && f.codTienda)
    .map((f) => ({ ...f, accion: 'CONFIRMAR', codTienda: f.codTienda }));
  if (!items.length) return;
  const conf = await confirm({
    titulo: `Confirmar ${items.length} ${estado === 'EXACTA' ? 'exactas' : 'fuertes'}`,
    mensaje: 'Se guardarán como alias confirmados de una sola vez.',
    tipo: 'info', labelConfirmar: 'Confirmar',
  });
  if (!conf.ok) return;
  confirmandoLote.value = true;
  try {
    const r = await confirmarAlias(items);
    modal.value = { visible: true, titulo: 'Confirmadas', mensaje: `${r.confirmadas} tiendas confirmadas.`, tipo: 'success' };
    await generarSugerencias();
  } catch (e) { error(e, 'No se pudo confirmar el lote.'); }
  finally { confirmandoLote.value = false; }
}

// ── Alias confirmados ────────────────────────────────────────────────────
const confirmados = ref([]);
const cargandoConfirmados = ref(false);
const buscarConfirmados = ref('');

async function cambiarAConfirmados() {
  tab.value = 'confirmados';
  cargandoConfirmados.value = true;
  try { confirmados.value = await getAliasConfirmados(); } finally { cargandoConfirmados.value = false; }
}

const confirmadosFiltrados = computed(() => {
  const q = buscarConfirmados.value.trim().toLowerCase();
  if (!q) return confirmados.value;
  return confirmados.value.filter((a) =>
    [a.NombreRS1, a.NombreRS2, a.TiendaErp].some((s) => (s || '').toLowerCase().includes(q)));
});

async function reasignar(a, codTienda) {
  if (!codTienda || codTienda === a.CodTienda) return;
  try {
    await actualizarAlias(a.IdAlias, { codTienda });
    confirmados.value = await getAliasConfirmados();
  } catch (e) { error(e, 'No se pudo reasignar.'); }
}
</script>

<style scoped>
.alias-tabs { display: flex; gap: 6px; margin-bottom: 16px; }
.alias-tab {
  padding: 9px 16px; border: 1px solid var(--border); background: #fff; border-radius: 8px 8px 0 0;
  cursor: pointer; font-size: 14px; color: var(--muted); font-family: inherit;
}
.alias-tab.on { color: var(--text); font-weight: 600; border-bottom-color: #fff; background: #fff; box-shadow: 0 -2px 0 var(--accent) inset; }
.txt-muted { color: var(--muted); }
</style>
