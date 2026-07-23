<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Bandeja de Pagos</h1>
        <p class="page__hint">Facturas validadas por Auditoría, pendientes de registrar el comprobante de pago.</p>
      </div>
    </div>

    <ModalFeedback :visible="modal.visible" :titulo="modal.titulo" :mensaje="modal.mensaje" :tipo="modal.tipo" @close="onModalClose" />

    <div class="card"><SelectorZMT :store="store" @buscar="onTienda" /></div>

    <div v-if="pendientes.length" class="card colapsable-card">
      <button class="colapsable-toggle" @click="pendientesAbiertos = !pendientesAbiertos">
        <span class="colapsable-toggle__text">
          <span class="badge badge--amber">{{ pendientes.length }}</span>
          Tiendas con pendientes
        </span>
        <span class="colapsable-toggle__arrow" :class="{ open: pendientesAbiertos }">›</span>
      </button>
      <ul v-if="pendientesAbiertos" class="pend-lista colapsable-lista">
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
              <router-link class="btn btn--primary btn--sm"
                :to="`/factura/${g.codTienda}/${enc(g.numserie)}/${g.numfactura}/${enc(g.n)}`">
                Registrar pago
              </router-link>
              <button v-if="auth.esPagosDevolver" class="btn btn--warn btn--sm" :disabled="busy" @click="devolver(g)">Devolver</button>
            </td>
          </tr>
        </tbody>
      </table></div>
      <p v-if="!filtradas.length" class="page__hint">Sin resultados para los filtros aplicados.</p>
    </template>
    <div v-else-if="buscado" class="empty card">No hay facturas pendientes de pago para esta selección. 🎉</div>
    <p v-else class="page__hint">Elige una tienda arriba.</p>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import SelectorZMT from '../components/SelectorZMT.vue';
import ModalFeedback from '../components/ModalFeedback.vue';
import { usePagosStore } from '../stores/vistas';
import { useNotifStore } from '../stores/notificaciones';
import { useAuthStore } from '../stores/auth';
import { useConfirm } from '../composables/useConfirm';
import { getBandeja, accionPagoDevolver } from '../api/facturas';
import { money, fecha } from '../utils/format';

const store = usePagosStore();
const notif = useNotifStore();
const auth = useAuthStore();
const { confirm } = useConfirm();
const allItems = ref([]);
const loading = ref(false);
const buscado = ref(false);
const busy = ref(false);
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });
const enc = encodeURIComponent;
const filtros = ref({ desde: '', hasta: '', proveedor: '', tipoGasto: '' });

const pendientes = computed(() => notif.detalle.pago);
const pendientesAbiertos = ref(false);
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
function onTienda() { buscado.value = true; limpiar(); }

async function cargar() {
  loading.value = true;
  try { allItems.value = await getBandeja('PENDIENTE_PAGO'); }
  finally { loading.value = false; }
}

async function devolver(g) {
  const conf = await confirm({
    titulo: 'Devolver factura', mensaje: 'La factura volverá a Auditoría para su revisión.', tipo: 'warn',
    pedirComentario: true, comentarioRequerido: true, placeholder: 'Motivo de la devolución…', labelConfirmar: 'Devolver',
  });
  if (!conf.ok) return;
  busy.value = true;
  try {
    await accionPagoDevolver({ codTienda: g.codTienda, numserie: g.numserie, numfactura: g.numfactura, n: g.n, marca: g.marca, decision: 'DEVUELTO', comentario: conf.comentario });
    modal.value = { visible: true, titulo: 'Devuelta', mensaje: 'Factura devuelta a Auditoría.', tipo: 'warn' };
  } finally { busy.value = false; }
}

function onModalClose() {
  modal.value.visible = false;
  notif.refrescar();
  cargar();
}

onMounted(cargar);
</script>
