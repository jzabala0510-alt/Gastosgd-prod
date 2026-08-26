<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Archivo</h1>
        <p class="page__hint">Filtra por zona, marca y tienda. Consulta cualquier gasto sin importar su estado — es de solo lectura, para tomar acciones usa el módulo correspondiente.</p>
      </div>
    </div>

    <div class="card"><SelectorZMT :store="store" @buscar="onTienda" /></div>

    <p v-if="loading" class="page__hint">Cargando facturas…</p>
    <div v-else-if="aviso" class="empty card">{{ aviso }}</div>
    <template v-else-if="facturas.length">
      <div class="card filtros">
        <div class="field" :class="{ 'field--active': store.filtros.fecha }"><label>Fecha</label><input type="date" v-model="store.filtros.fecha" /></div>
        <div class="field" :class="{ 'field--active': store.filtros.fechaSolicitud }"><label>F. Solicitud</label><input type="date" v-model="store.filtros.fechaSolicitud" /></div>
        <div class="field" :class="{ 'field--active': store.filtros.proveedor }"><label>Proveedor</label><input v-model="store.filtros.proveedor" placeholder="Nombre…" /></div>
        <div class="field" :class="{ 'field--active': store.filtros.estado }">
          <label>Estado</label>
          <select v-model="store.filtros.estado">
            <option value="">Todos</option>
            <option v-for="(l, k) in ESTADO_LABEL" :key="k" :value="k">{{ l }}</option>
          </select>
        </div>
        <div class="field" :class="{ 'field--active': store.filtros.tipoGasto }">
          <label>Tipo de gasto</label>
          <select v-model="store.filtros.tipoGasto">
            <option value="">Todos</option>
            <option v-for="t in tiposGasto" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <button class="btn btn--sm" @click="store.limpiarFiltros()">Limpiar</button>
      </div>

      <p class="page__hint">{{ filtradas.length }} de {{ facturas.length }} facturas</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr>
          <th v-if="!store.codTienda">Tienda</th>
          <th>Factura</th><th>Fecha</th><th>F. Solicitud</th><th>Proveedor</th><th>Tipo de gasto</th><th class="r">Total (Bs)</th><th class="r">Pendiente (Bs)</th><th>Estado</th>
        </tr></thead>
        <tbody>
          <tr v-for="f in filtradas" :key="key(f)" class="row-link" :class="{ sel: store.seleccion === key(f) }" @click="abrir(f)">
            <td v-if="!store.codTienda" style="white-space:nowrap">{{ f.marca }} · {{ f.tienda }}</td>
            <td><code>{{ f.numserie }}-{{ f.numfactura }}</code></td>
            <td>{{ fecha(f.fechaFactura) }}</td>
            <td>{{ fecha(f.fecha) }}</td>
            <td>{{ f.proveedor || '—' }}</td>
            <td>{{ f.tipoGasto || '—' }}</td>
            <td class="r">{{ money(f.totalVes) }}</td>
            <td class="r">{{ money(f.pendienteVes) }}</td>
            <td><span class="badge" :class="estClass(f.estado)">{{ estLabel(f.estado) }}</span></td>
          </tr>
        </tbody>
      </table></div>
    </template>
    <p v-else-if="store.zona" class="page__hint">Sin facturas para la selección actual.</p>
    <p v-else class="page__hint">Elige una zona arriba.</p>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import SelectorZMT from '../components/SelectorZMT.vue';
import { useArchivoStore } from '../stores/vistas';
import { getReporte } from '../api/reportes';
import { ESTADO_LABEL, ESTADO_CLASS } from '../utils/estados';
import { money, fecha } from '../utils/format';

const router = useRouter();
const store = useArchivoStore();
const facturas = ref([]);
const loading = ref(false);
const aviso = ref('');

const estLabel = (e) => ESTADO_LABEL[e] || e;
const estClass = (e) => ESTADO_CLASS[e] || 'badge--gray';
const key = (f) => `${f.numserie}-${f.numfactura}-${f.n}`;

const tiposGasto = computed(() => {
  const set = new Set(facturas.value.map((f) => f.tipoGasto || 'SIN ESPECIFICAR'));
  return [...set].sort();
});

const filtradas = computed(() => {
  const ff = store.filtros;
  return facturas.value.filter((f) => {
    if (ff.fecha && (f.fechaFactura || '').slice(0, 10) !== ff.fecha) return false;
    if (ff.fechaSolicitud && (f.fecha || '').slice(0, 10) !== ff.fechaSolicitud) return false;
    if (ff.proveedor && !(f.proveedor || '').toLowerCase().includes(ff.proveedor.toLowerCase())) return false;
    if (ff.estado && f.estado !== ff.estado) return false;
    if (ff.tipoGasto && (f.tipoGasto || 'SIN ESPECIFICAR') !== ff.tipoGasto) return false;
    return true;
  });
});

// A diferencia de Gastos.vue (limitado a lo pendiente en el ERP, una llamada por
// tienda), reportes.service.js::listado() ya resuelve zona completa del lado del
// servidor y trae CUALQUIER estado (incl. ya pagado/rechazado) en una sola llamada.
async function onTienda(cod) {
  facturas.value = [];
  aviso.value = '';
  if (!store.zona) return;
  loading.value = true;
  try {
    const out = await getReporte({ zona: store.zona, codTienda: cod || undefined });
    facturas.value = out.rows;
  } finally { loading.value = false; }
}

function abrir(f) {
  store.seleccion = key(f);
  router.push(`/factura/${f.codTienda}/${encodeURIComponent(f.numserie)}/${f.numfactura}/${encodeURIComponent(f.n)}`);
}
</script>
