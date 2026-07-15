<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Auditoría</h1>
        <p class="page__hint">{{ tabActivo === 'auditoria' ? 'Facturas validadas por Tesorería, pendientes de tu aprobación.' : 'Comprobantes de pago subidos por el Pagador, pendientes de confirmación.' }}</p>
      </div>
    </div>

    <ModalFeedback :visible="modal.visible" :titulo="modal.titulo" :mensaje="modal.mensaje" :tipo="modal.tipo" @close="onModalClose" />

    <!-- Pestañas -->
    <div class="tabs-bar">
      <button :class="['tab-btn', tabActivo === 'auditoria' && 'tab-btn--active']" @click="setTab('auditoria')">
        Pendientes de Auditoría
        <span v-if="notif.auditoria" class="badge badge--blue" style="margin-left:6px">{{ notif.auditoria }}</span>
      </button>
      <button :class="['tab-btn', tabActivo === 'pagos' && 'tab-btn--active']" @click="setTab('pagos')">
        Comprobantes por Confirmar
        <span v-if="notif.pagosRevision" class="badge badge--amber" style="margin-left:6px">{{ notif.pagosRevision }}</span>
      </button>
    </div>

    <!-- ── Tab Auditoría ─────────────────────────────────────── -->
    <template v-if="tabActivo === 'auditoria'">
      <div class="card"><SelectorZMT :store="store" @buscar="onTienda" /></div>

      <div v-if="pendientes.length" class="card">
        <h3 class="card__title">Tiendas con pendientes ({{ pendientes.length }})</h3>
        <ul class="pend-lista">
          <li v-for="it in pendientes" :key="it.codTienda" class="pend-row" @click="saltarA(it)">
            <span class="pend-row__lugar"><b>{{ it.tienda }}</b> · {{ it.zona }} · {{ it.marca }}</span>
            <span class="badge badge--amber">{{ it.n }}</span>
            <span class="zona-row__arrow">›</span>
          </li>
        </ul>
      </div>

      <p v-if="loading" class="page__hint">Cargando…</p>
      <template v-else-if="tiendaItems.length">
        <div class="card filtros">
          <div class="field" :class="{ 'field--active': filtros.desde }"><label>Desde</label><input type="date" v-model="filtros.desde" /></div>
          <div class="field" :class="{ 'field--active': filtros.hasta }"><label>Hasta</label><input type="date" v-model="filtros.hasta" /></div>
          <div class="field" :class="{ 'field--active': filtros.proveedor }"><label>Proveedor</label><input v-model="filtros.proveedor" placeholder="Nombre…" /></div>
          <div class="field" :class="{ 'field--active': filtros.tipoGasto }">
            <label>Tipo de gasto</label>
            <select v-model="filtros.tipoGasto">
              <option value="">Todos</option>
              <option v-for="t in tiposGasto" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <button class="btn btn--sm" @click="limpiar">Limpiar</button>
        </div>
        <p class="page__hint">{{ filtradas.length }} de {{ tiendaItems.length }} facturas</p>
        <div class="table-wrap"><table class="grid">
          <thead>
            <tr>
              <th v-if="!store.codTienda">Tienda</th>
              <th>Factura</th><th>Fecha</th><th>Proveedor</th><th>Tipo de gasto</th><th class="r">Total (Bs)</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in filtradas" :key="g.codTienda + '-' + g.numserie + '-' + g.numfactura">
              <td v-if="!store.codTienda" style="white-space:nowrap">{{ g.marca }} · {{ g.tienda }}</td>
              <td><code>{{ g.numserie }}-{{ g.numfactura }}</code></td>
              <td>{{ fecha(g.fecha) }}</td>
              <td>{{ g.proveedor || '—' }}</td>
              <td>{{ g.tipoGasto || '—' }}</td>
              <td class="r">{{ money(g.total) }} Bs</td>
              <td class="acciones-inline">
                <router-link class="btn btn--sm" :to="`/factura/${g.codTienda}/${enc(g.numserie)}/${g.numfactura}/${enc(g.n)}`">Revisar</router-link>
                <button class="btn btn--primary btn--sm" :disabled="busy" @click="dec(g, 'APROBADO')">Aprobar</button>
                <button class="btn btn--warn btn--sm" :disabled="busy" @click="dec(g, 'DEVUELTO')">Devolver</button>
                <button class="btn btn--danger btn--sm" :disabled="busy" @click="dec(g, 'RECHAZADO')">Rechazar</button>
              </td>
            </tr>
          </tbody>
        </table></div>
        <p v-if="!filtradas.length" class="page__hint">Sin resultados para los filtros aplicados.</p>
      </template>
      <div v-else-if="buscado" class="empty card">No hay facturas pendientes de Auditoría para esta selección. 🎉</div>
      <p v-else class="page__hint">Elige una tienda arriba.</p>
    </template>

    <!-- ── Tab Comprobantes por Confirmar ───────────────────── -->
    <template v-else>
      <p v-if="loadingPagos" class="page__hint">Cargando…</p>
      <template v-else-if="pagoItems.length">
        <p class="page__hint">{{ pagoItems.length }} factura{{ pagoItems.length > 1 ? 's' : '' }} con comprobante pendiente de confirmación</p>
        <div class="table-wrap"><table class="grid">
          <thead>
            <tr>
              <th>Tienda</th>
              <th>Factura</th><th>Fecha</th><th>Proveedor</th><th>Tipo de gasto</th><th class="r">Total (Bs)</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in pagoItems" :key="g.codTienda + '-' + g.numserie + '-' + g.numfactura">
              <td style="white-space:nowrap">{{ g.marca }} · {{ g.tienda }}</td>
              <td><code>{{ g.numserie }}-{{ g.numfactura }}</code></td>
              <td>{{ fecha(g.fecha) }}</td>
              <td>{{ g.proveedor || '—' }}</td>
              <td>{{ g.tipoGasto || '—' }}</td>
              <td class="r">{{ money(g.total) }} Bs</td>
              <td class="acciones-inline">
                <router-link class="btn btn--sm" :to="`/factura/${g.codTienda}/${enc(g.numserie)}/${g.numfactura}/${enc(g.n)}`">Ver</router-link>
                <button class="btn btn--primary btn--sm" :disabled="busy" @click="confirmar(g, 'CONFIRMADO')">Confirmar pago</button>
                <button class="btn btn--warn btn--sm" :disabled="busy" @click="confirmar(g, 'DEVUELTO')">Devolver al Pagador</button>
              </td>
            </tr>
          </tbody>
        </table></div>
      </template>
      <div v-else class="empty card">No hay comprobantes pendientes de confirmación. 🎉</div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import SelectorZMT from '../components/SelectorZMT.vue';
import ModalFeedback from '../components/ModalFeedback.vue';
import { useAuditoriaStore } from '../stores/vistas';
import { useNotifStore } from '../stores/notificaciones';
import { useConfirm } from '../composables/useConfirm';
import { getBandeja, accionAuditoria, confirmarPago } from '../api/facturas';
import { money, fecha } from '../utils/format';

const store = useAuditoriaStore();
const notif = useNotifStore();
const { confirm } = useConfirm();
const allItems = ref([]);
const pagoItems = ref([]);
const loading = ref(false);
const loadingPagos = ref(false);
const buscado = ref(false);
const busy = ref(false);
const enc = encodeURIComponent;
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });
const filtros = ref({ desde: '', hasta: '', proveedor: '', tipoGasto: '' });
const tabActivo = ref('auditoria');

const pendientes = computed(() => notif.detalle.auditoria);
function saltarA(it) {
  store.$patch({ zona: it.zona, marca: it.marca, codTienda: it.codTienda, autobuscar: true });
}

const tiendaItems = computed(() => {
  if (!buscado.value) return [];
  if (store.codTienda) return allItems.value.filter((g) => Number(g.codTienda) === Number(store.codTienda));
  const scope = new Set(store.tiendas.map((t) => Number(t.CodTienda)));
  return scope.size ? allItems.value.filter((g) => scope.has(Number(g.codTienda))) : [];
});
const tiposGasto = computed(() =>
  [...new Set(tiendaItems.value.map((g) => g.tipoGasto || 'SIN ESPECIFICAR'))].sort(),
);

const filtradas = computed(() => {
  const ff = filtros.value;
  return tiendaItems.value.filter((g) => {
    const d = (g.fecha || '').slice(0, 10);
    if (ff.desde && d < ff.desde) return false;
    if (ff.hasta && d > ff.hasta) return false;
    if (ff.proveedor && !(g.proveedor || '').toLowerCase().includes(ff.proveedor.toLowerCase())) return false;
    if (ff.tipoGasto && (g.tipoGasto || 'SIN ESPECIFICAR') !== ff.tipoGasto) return false;
    return true;
  });
});

function limpiar() { filtros.value = { desde: '', hasta: '', proveedor: '', tipoGasto: '' }; }

async function loadAuditoria() {
  loading.value = true;
  try { allItems.value = await getBandeja('PENDIENTE_AUDITORIA'); }
  finally { loading.value = false; }
}

async function loadPagos() {
  loadingPagos.value = true;
  try { pagoItems.value = await getBandeja('PAGO_EN_REVISION'); }
  finally { loadingPagos.value = false; }
}

function setTab(tab) {
  tabActivo.value = tab;
  if (tab === 'auditoria' && !allItems.value.length) loadAuditoria();
  if (tab === 'pagos') loadPagos();
}

function onTienda() { buscado.value = true; limpiar(); }

async function pedirConfirmacion(decision) {
  if (decision === 'APROBADO') {
    return confirm({ titulo: 'Aprobar factura', mensaje: 'Se enviará al módulo de Pagos.', tipo: 'info', labelConfirmar: 'Aprobar' });
  }
  if (decision === 'DEVUELTO') {
    return confirm({ titulo: 'Devolver factura', mensaje: 'La factura volverá al Analista para su corrección.', tipo: 'warn', pedirComentario: true, comentarioRequerido: true, placeholder: 'Motivo de la devolución…', labelConfirmar: 'Devolver' });
  }
  return confirm({ titulo: 'Rechazar factura', mensaje: 'Esta acción rechaza la factura.', tipo: 'danger', pedirComentario: true, comentarioRequerido: true, placeholder: 'Motivo del rechazo…', labelConfirmar: 'Rechazar' });
}

async function dec(g, decision) {
  const conf = await pedirConfirmacion(decision);
  if (!conf.ok) return;
  busy.value = true;
  try {
    await accionAuditoria({ codTienda: g.codTienda, numserie: g.numserie, numfactura: g.numfactura, n: g.n, marca: g.marca, decision, comentario: conf.comentario });
    if (decision === 'APROBADO') modal.value = { visible: true, titulo: 'Aprobada', mensaje: 'Factura enviada al módulo de Pagos.', tipo: 'success' };
    else if (decision === 'DEVUELTO') modal.value = { visible: true, titulo: 'Devuelta', mensaje: 'Factura devuelta al Analista.', tipo: 'warn' };
    else modal.value = { visible: true, titulo: 'Rechazada', mensaje: 'Factura rechazada.', tipo: 'error' };
  } finally { busy.value = false; }
}

async function confirmar(g, decision) {
  const conf = decision === 'CONFIRMADO'
    ? await confirm({ titulo: 'Confirmar pago', mensaje: 'El comprobante ha sido revisado. La factura quedará marcada como pagada definitivamente.', tipo: 'info', labelConfirmar: 'Confirmar pago' })
    : await confirm({ titulo: 'Devolver al Pagador', mensaje: 'El comprobante será rechazado y el Pagador deberá subir uno nuevo.', tipo: 'warn', pedirComentario: true, comentarioRequerido: true, placeholder: 'Motivo de la devolución…', labelConfirmar: 'Devolver' });
  if (!conf.ok) return;
  busy.value = true;
  try {
    await confirmarPago({ codTienda: g.codTienda, numserie: g.numserie, numfactura: g.numfactura, n: g.n, marca: g.marca, decision, comentario: conf.comentario });
    if (decision === 'CONFIRMADO') modal.value = { visible: true, titulo: 'Pago confirmado', mensaje: 'La factura fue marcada como pagada.', tipo: 'success' };
    else modal.value = { visible: true, titulo: 'Devuelta al Pagador', mensaje: 'El Pagador deberá subir un nuevo comprobante.', tipo: 'warn' };
  } finally { busy.value = false; }
}

function onModalClose() {
  modal.value.visible = false;
  notif.refrescar();
  if (tabActivo.value === 'auditoria') loadAuditoria();
  else loadPagos();
}

onMounted(() => { loadAuditoria(); loadPagos(); });
</script>

<style scoped>
.tabs-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--border);
}
.tab-btn {
  padding: 8px 18px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  font-size: 0.9rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
}
.tab-btn:hover { color: var(--text); }
.tab-btn--active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
</style>
