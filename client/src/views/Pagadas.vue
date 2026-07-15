<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Facturas Pagadas</h1>
        <p class="page__hint">Facturas con su comprobante de pago registrado. Solo lectura.</p>
      </div>
    </div>

    <div class="card"><SelectorZMT :store="store" @buscar="onTienda" /></div>

    <p v-if="loading" class="page__hint">Cargando…</p>
    <template v-else-if="store.codTienda && tiendaItems.length">
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
          <tr><th>Factura</th><th>Fecha</th><th>Proveedor</th><th>Tipo de gasto</th><th class="r">Total (Bs)</th><th>Estado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          <tr v-for="g in filtradas" :key="g.codTienda + '-' + g.numserie + '-' + g.numfactura">
            <td><code>{{ g.numserie }}-{{ g.numfactura }}</code></td>
            <td>{{ fecha(g.fecha) }}</td>
            <td>{{ g.proveedor || '—' }}</td>
            <td>{{ g.tipoGasto || '—' }}</td>
            <td class="r">{{ money(g.total) }} Bs</td>
            <td><span class="badge badge--green">Pagada</span></td>
            <td>
              <router-link class="btn btn--sm"
                :to="`/factura/${g.codTienda}/${enc(g.numserie)}/${g.numfactura}/${enc(g.n)}`">
                Ver comprobante
              </router-link>
            </td>
          </tr>
        </tbody>
      </table></div>
      <p v-if="!filtradas.length" class="page__hint">Sin resultados para los filtros aplicados.</p>
    </template>
    <div v-else-if="store.codTienda" class="empty card">Aún no hay facturas pagadas para esta tienda.</div>
    <p v-else class="page__hint">Elige una tienda arriba.</p>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import SelectorZMT from '../components/SelectorZMT.vue';
import { usePagadasStore } from '../stores/vistas';
import { getBandeja } from '../api/facturas';
import { money, fecha } from '../utils/format';

const store = usePagadasStore();
const allItems = ref([]);
const loading = ref(false);
const enc = encodeURIComponent;
const filtros = ref({ desde: '', hasta: '', proveedor: '', tipoGasto: '' });

const tiendaItems = computed(() =>
  store.codTienda ? allItems.value.filter((g) => Number(g.codTienda) === Number(store.codTienda)) : [],
);
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
function onTienda() { limpiar(); }

onMounted(async () => {
  loading.value = true;
  try { allItems.value = await getBandeja('PAGADO'); }
  finally { loading.value = false; }
});
</script>
