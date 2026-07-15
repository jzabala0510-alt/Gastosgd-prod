<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Bandeja de Gastos</h1>
        <p class="page__hint">Filtra por zona, marca y tienda. Revisa, complementa y aprueba para enviar a Tesorería.</p>
      </div>
    </div>

    <div class="card"><SelectorZMT :store="store" @buscar="onTienda" /></div>

    <!-- Facturas pagadas recientes (últimas 48 h) — colapsable -->
    <div v-if="pagadas.length" class="card pagadas-card">
      <button class="pagadas-toggle" @click="pagadasAbiertas = !pagadasAbiertas">
        <span class="pagadas-toggle__text">
          <span class="badge badge--green">{{ pagadas.length }}</span>
          Pagadas en las últimas 48 h
        </span>
        <span class="pagadas-toggle__arrow" :class="{ open: pagadasAbiertas }">›</span>
      </button>
      <ul v-if="pagadasAbiertas" class="pend-lista pagadas-lista">
        <li v-for="p in pagadas" :key="`${p.numserie}-${p.numfactura}-${p.n}`"
            class="pend-row" @click="abrirPagada(p)">
          <span class="pend-row__lugar">
            <code>{{ p.numserie }}-{{ p.numfactura }}</code>
            <template v-if="p.proveedor"> · {{ p.proveedor }}</template>
          </span>
          <span class="badge badge--green">Pagado {{ fecha(p.fechaPago) }}</span>
          <span class="zona-row__arrow">›</span>
        </li>
      </ul>
    </div>

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
          <th>Factura</th><th>Fecha</th><th>F. Solicitud</th><th>Proveedor</th><th>Nº control</th><th>Tipo de gasto</th><th>Tipo doc.</th><th class="r">Total (Bs)</th><th class="r">Pendiente (Bs)</th><th>Estado</th>
        </tr></thead>
        <tbody>
          <tr v-for="f in filtradas" :key="key(f)" class="row-link" :class="{ sel: store.seleccion === key(f) }" @click="abrir(f)">
            <td v-if="!store.codTienda" style="white-space:nowrap">{{ f._marca }} · {{ f._tiendaNombre }}</td>
            <td><code>{{ f.NUMSERIE }}-{{ f.NUMFACTURA }}</code></td>
            <td>{{ fecha(f.FECHA) }}</td>
            <td>{{ fecha(f.FechaSolicitud) }}</td>
            <td>{{ f.Proveedor || '—' }}</td>
            <td>{{ f.NUMCONTROL || '—' }}</td>
            <td>{{ f.TipoGasto || '—' }}</td>
            <td>{{ tipoDoc(f.TIPODOC) }}</td>
            <td class="r">{{ money(f.TotalVes) }}</td>
            <td class="r">{{ money(f.PendienteVes) }}</td>
            <td><span class="badge" :class="estClass(f.Estado)">{{ estLabel(f.Estado) }}</span></td>
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
import { useGastosStore } from '../stores/vistas';
import { getFacturas, getPagadasRecientes } from '../api/facturas';
import { ESTADO_LABEL, ESTADO_CLASS } from '../utils/estados';
import { money, fecha } from '../utils/format';

const router = useRouter();
const store = useGastosStore();
const facturas = ref([]);
const pagadas = ref([]);
const pagadasAbiertas = ref(false);
const loading = ref(false);
const aviso = ref('');

const estLabel = (e) => ESTADO_LABEL[e] || e;
const estClass = (e) => ESTADO_CLASS[e] || 'badge--gray';
const key = (f) => `${f.NUMSERIE}-${f.NUMFACTURA}-${f.N}`;
const tipoDoc = (t) => t === 12 ? 'Factura Gastos' : t === 20 ? 'Gastos no deducibles' : '—';

const tiposGasto = computed(() => {
  const set = new Set(facturas.value.map((f) => f.TipoGasto || 'SIN ESPECIFICAR'));
  return [...set].sort();
});

const filtradas = computed(() => {
  const ff = store.filtros;
  return facturas.value.filter((f) => {
    if (ff.fecha && (f.FECHA || '').slice(0, 10) !== ff.fecha) return false;
    if (ff.fechaSolicitud && (f.FechaSolicitud || '').slice(0, 10) !== ff.fechaSolicitud) return false;
    if (ff.proveedor && !(f.Proveedor || '').toLowerCase().includes(ff.proveedor.toLowerCase())) return false;
    if (ff.estado && f.Estado !== ff.estado) return false;
    if (ff.tipoGasto && (f.TipoGasto || 'SIN ESPECIFICAR') !== ff.tipoGasto) return false;
    return true;
  });
});

async function onTienda(cod) {
  facturas.value = [];
  pagadas.value = [];
  pagadasAbiertas.value = false;
  aviso.value = '';
  const scopeTiendas = store.tiendas;
  if (!cod && !scopeTiendas.length) return;

  loading.value = true;
  try {
    if (cod) {
      const [r, p] = await Promise.all([getFacturas(cod), getPagadasRecientes(cod)]);
      if (!r.disponibleLocal) aviso.value = r.aviso || 'Datos no disponibles localmente.';
      else facturas.value = r.facturas.map((f) => ({ ...f, _codTienda: cod, _tiendaNombre: r.tienda?.Nombre || '' }));
      pagadas.value = p.map((x) => ({ ...x, _codTienda: cod }));
    } else {
      // Todas las tiendas del scope — llamadas en paralelo
      const [facResults, pagResults] = await Promise.all([
        Promise.all(scopeTiendas.map((t) => getFacturas(t.CodTienda).catch(() => null))),
        Promise.all(scopeTiendas.map((t) => getPagadasRecientes(t.CodTienda).catch(() => []))),
      ]);
      for (const [i, r] of facResults.entries()) {
        if (r?.disponibleLocal && r.facturas?.length) {
          facturas.value.push(...r.facturas.map((f) => ({
            ...f,
            _codTienda: scopeTiendas[i].CodTienda,
            _marca: r.tienda?.Marca || scopeTiendas[i].Marca || '',
            _tiendaNombre: r.tienda?.Nombre || scopeTiendas[i].Tienda || '',
          })));
        }
      }
      for (const [i, p] of pagResults.entries()) {
        pagadas.value.push(...p.map((x) => ({ ...x, _codTienda: scopeTiendas[i].CodTienda })));
      }
    }
  } finally { loading.value = false; }
}
function abrir(f) {
  store.seleccion = key(f);
  const cod = f._codTienda ?? store.codTienda;
  router.push(`/factura/${cod}/${encodeURIComponent(f.NUMSERIE)}/${f.NUMFACTURA}/${encodeURIComponent(f.N)}`);
}
function abrirPagada(p) {
  const cod = p._codTienda ?? store.codTienda;
  router.push(`/factura/${cod}/${encodeURIComponent(p.numserie)}/${p.numfactura}/${encodeURIComponent(p.n)}`);
}
</script>

<style scoped>
.pagadas-card { padding: 0; overflow: hidden; }

.pagadas-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  border: none;
  padding: 14px 20px;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  color: #374151;
  text-align: left;
}
.pagadas-toggle:hover { background: #f9fafb; }
.pagadas-toggle__text { display: flex; align-items: center; gap: 10px; font-weight: 500; }
.pagadas-toggle__arrow {
  color: #86bb25;
  font-size: 20px;
  line-height: 1;
  transition: transform .2s;
  flex-shrink: 0;
}
.pagadas-toggle__arrow.open { transform: rotate(90deg); }

.pagadas-lista { padding: 0 16px 14px; border-top: 1px solid #f3f4f6; margin-top: 0; }
</style>
