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
    <template v-else-if="store.facturas.length">
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

      <p class="page__hint">{{ filtradas.length }} de {{ store.facturas.length }} facturas</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr>
          <th v-if="!store.codTienda" class="th-sort" @click="ordenarPor('marca')">Tienda{{ flecha('marca') }}</th>
          <th class="th-sort" @click="ordenarPor('numfactura')">Factura{{ flecha('numfactura') }}</th>
          <th class="th-sort" @click="ordenarPor('fechaFactura')">Fecha{{ flecha('fechaFactura') }}</th>
          <th class="th-sort" @click="ordenarPor('fecha')">F. Solicitud{{ flecha('fecha') }}</th>
          <th class="th-sort" @click="ordenarPor('proveedor')">Proveedor{{ flecha('proveedor') }}</th>
          <th class="th-sort" @click="ordenarPor('tipoGasto')">Tipo de gasto{{ flecha('tipoGasto') }}</th>
          <th class="r th-sort" @click="ordenarPor('totalVes')">Total (Bs){{ flecha('totalVes') }}</th>
          <th class="r th-sort" @click="ordenarPor('pendienteVes')">Pendiente (Bs){{ flecha('pendienteVes') }}</th>
          <th class="th-sort" @click="ordenarPor('estado')">Estado{{ flecha('estado') }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="f in ordenadas" :key="key(f)" class="row-link" :class="{ sel: store.seleccion === key(f) }" @click="abrir(f)">
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
const loading = ref(false);
const aviso = ref('');

const estLabel = (e) => ESTADO_LABEL[e] || e;
const estClass = (e) => ESTADO_CLASS[e] || 'badge--gray';
const key = (f) => `${f.numserie}-${f.numfactura}-${f.n}`;

const tiposGasto = computed(() => {
  const set = new Set(store.facturas.map((f) => f.tipoGasto || 'SIN ESPECIFICAR'));
  return [...set].sort();
});

const filtradas = computed(() => {
  const ff = store.filtros;
  return store.facturas.filter((f) => {
    if (ff.fecha && (f.fechaFactura || '').slice(0, 10) !== ff.fecha) return false;
    if (ff.fechaSolicitud && (f.fecha || '').slice(0, 10) !== ff.fechaSolicitud) return false;
    if (ff.proveedor && !(f.proveedor || '').toLowerCase().includes(ff.proveedor.toLowerCase())) return false;
    if (ff.estado && f.estado !== ff.estado) return false;
    if (ff.tipoGasto && (f.tipoGasto || 'SIN ESPECIFICAR') !== ff.tipoGasto) return false;
    return true;
  });
});

// Ordenar por columna (clic en el encabezado, alterna asc/desc).
const sortBy = ref('');
const sortDir = ref('asc');
function ordenarPor(campo) {
  if (sortBy.value === campo) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortBy.value = campo; sortDir.value = 'asc'; }
}
function flecha(campo) { return sortBy.value === campo ? (sortDir.value === 'asc' ? ' ▲' : ' ▼') : ''; }
const ordenadas = computed(() => {
  if (!sortBy.value) return filtradas.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...filtradas.value].sort((a, b) => {
    const va = a[sortBy.value]; const vb = b[sortBy.value];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
});

// A diferencia de Gastos.vue (limitado a lo pendiente en el ERP, una llamada por
// tienda), reportes.service.js::listado() ya resuelve zona completa del lado del
// servidor y trae CUALQUIER estado (incl. ya pagado/rechazado) en una sola llamada.
async function onTienda(cod) {
  store.facturas = [];
  store.limpiarFiltros();
  aviso.value = '';
  if (!store.zona) return;
  loading.value = true;
  try {
    const out = await getReporte({ zona: store.zona, codTienda: cod || undefined });
    store.facturas = out.rows;
  } finally { loading.value = false; }
}

function abrir(f) {
  store.seleccion = key(f);
  router.push({
    path: `/factura/${f.codTienda}/${encodeURIComponent(f.numserie)}/${f.numfactura}/${encodeURIComponent(f.n)}`,
    query: { soloVista: '1' },
  });
}
</script>
