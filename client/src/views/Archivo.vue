<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Archivo</h1>
        <p class="page__hint">Consulta cualquier gasto sin importar su estado (pendiente, pagado, rechazado, devuelto…). Solo lectura — para aprobar, pagar o devolver usa el módulo correspondiente.</p>
      </div>
    </div>

    <div class="card filtros">
      <div class="field" :class="{ 'field--active': zona }">
        <label>Zona</label>
        <select v-model="zona" @change="onZona">
          <option value="">Selecciona zona…</option>
          <option value="TODAS">Todas las zonas</option>
          <option v-for="z in zonas" :key="z.Zona" :value="z.Zona">{{ z.Zona }} ({{ z.Tiendas }})</option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': codTienda }">
        <label>Tienda (opcional)</label>
        <select v-model="codTienda" :disabled="!zona || zona === 'TODAS'">
          <option value="">Todas las de la zona</option>
          <option v-for="t in tiendas" :key="t.CodTienda" :value="t.CodTienda">{{ t.Tienda }}<template v-if="t.Marca"> — {{ t.Marca }}</template></option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': desde }"><label>Desde</label><input type="date" v-model="desde" /></div>
      <div class="field" :class="{ 'field--active': hasta }"><label>Hasta</label><input type="date" v-model="hasta" /></div>
      <button class="btn btn--primary" :disabled="!zona || loading" @click="buscar">{{ loading ? 'Buscando…' : 'Buscar' }}</button>
    </div>

    <p v-if="loading" class="page__hint">Cargando…</p>
    <template v-else-if="facturas.length">
      <div class="card filtros">
        <div class="field" :class="{ 'field--active': filtros.proveedor }"><label>Proveedor</label><input v-model="filtros.proveedor" placeholder="Nombre…" /></div>
        <div class="field" :class="{ 'field--active': filtros.estado }">
          <label>Estado</label>
          <select v-model="filtros.estado">
            <option value="">Todos</option>
            <option v-for="(l, k) in ESTADO_LABEL" :key="k" :value="k">{{ l }}</option>
          </select>
        </div>
        <div class="field" :class="{ 'field--active': filtros.tipoGasto }">
          <label>Tipo de gasto</label>
          <select v-model="filtros.tipoGasto">
            <option value="">Todos</option>
            <option v-for="t in tiposGasto" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <button class="btn btn--sm" @click="limpiarFiltros">Limpiar</button>
      </div>

      <p class="page__hint">{{ filtradas.length }} de {{ facturas.length }} facturas</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr>
          <th>Zona</th><th>Tienda</th><th>Marca</th>
          <th>Factura</th><th>Fecha</th><th>Proveedor</th><th>Tipo de gasto</th>
          <th class="r">Total (Bs)</th><th class="r">Pendiente (Bs)</th><th>Estado</th>
        </tr></thead>
        <tbody>
          <tr v-for="f in filtradas" :key="key(f)" class="row-link" @click="abrir(f)">
            <td>{{ f.zona || '—' }}</td><td>{{ f.tienda || '—' }}</td><td>{{ f.marca || '—' }}</td>
            <td><code>{{ f.numserie }}-{{ f.numfactura }}</code></td>
            <td>{{ fecha(f.fecha) }}</td>
            <td>{{ f.proveedor || '—' }}</td>
            <td>{{ f.tipoGasto || '—' }}</td>
            <td class="r">{{ money(f.totalVes) }}</td>
            <td class="r">{{ money(f.pendienteVes) }}</td>
            <td><span class="badge" :class="estClass(f.estado)">{{ estLabel(f.estado) }}</span></td>
          </tr>
        </tbody>
      </table></div>
      <p v-if="!filtradas.length" class="page__hint">Sin resultados para los filtros aplicados.</p>
    </template>
    <div v-else-if="buscado" class="empty card">No hay gastos para la selección actual.</div>
    <p v-else class="page__hint">Elige una zona (y opcionalmente una tienda o un rango de fechas) y presiona Buscar.</p>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getZonas, getTiendas } from '../api/facturas';
import { getReporte } from '../api/reportes';
import { ESTADO_LABEL, ESTADO_CLASS } from '../utils/estados';
import { money, fecha } from '../utils/format';

const router = useRouter();

const zonas = ref([]);
const tiendas = ref([]);
const zona = ref('');
const codTienda = ref('');
const desde = ref('');
const hasta = ref('');
const facturas = ref([]);
const loading = ref(false);
const buscado = ref(false);
const filtros = ref({ proveedor: '', estado: '', tipoGasto: '' });

const estLabel = (e) => ESTADO_LABEL[e] || e;
const estClass = (e) => ESTADO_CLASS[e] || 'badge--gray';
const key = (f) => `${f.codTienda}-${f.numserie}-${f.numfactura}-${f.n}`;

const tiposGasto = computed(() => {
  const set = new Set(facturas.value.map((f) => f.tipoGasto || 'SIN ESPECIFICAR'));
  return [...set].sort();
});

const filtradas = computed(() => {
  const ff = filtros.value;
  return facturas.value.filter((f) => {
    if (ff.proveedor && !(f.proveedor || '').toLowerCase().includes(ff.proveedor.toLowerCase())) return false;
    if (ff.estado && f.estado !== ff.estado) return false;
    if (ff.tipoGasto && (f.tipoGasto || 'SIN ESPECIFICAR') !== ff.tipoGasto) return false;
    return true;
  });
});

function limpiarFiltros() { filtros.value = { proveedor: '', estado: '', tipoGasto: '' }; }

async function onZona() {
  codTienda.value = '';
  tiendas.value = (zona.value && zona.value !== 'TODAS') ? await getTiendas(zona.value) : [];
}

// Sin soloERP/soloPendientes/estado: listado() trae todo lo que alguna vez pasó
// por el flujo de la app (cualquier estado, incluido PAGADO/RECHAZADO/DEVUELTO)
// más lo que sigue pendiente en el ERP aunque no tenga flujo todavía.
async function buscar() {
  if (!zona.value) return;
  loading.value = true;
  buscado.value = true;
  limpiarFiltros();
  try {
    const params = {};
    if (zona.value !== 'TODAS') params.zona = zona.value;
    if (codTienda.value) params.codTienda = codTienda.value;
    if (desde.value) params.desde = desde.value;
    if (hasta.value) params.hasta = hasta.value;
    const out = await getReporte(params);
    facturas.value = out.rows;
  } finally { loading.value = false; }
}

function abrir(f) {
  router.push(`/factura/${f.codTienda}/${encodeURIComponent(f.numserie)}/${f.numfactura}/${encodeURIComponent(f.n)}`);
}

onMounted(async () => { zonas.value = await getZonas(); });
</script>
