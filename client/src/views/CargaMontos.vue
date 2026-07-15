<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Carga de Saldos</h1>
        <p class="page__hint">Selecciona zona, tienda y fecha, y carga el saldo disponible (Bs) por tienda y banco. Alimenta la cobertura de Tesorería.</p>
      </div>
    </div>

    <div class="card filtros">
      <div class="field" :class="{ 'field--active': zona }">
        <label>Zona</label>
        <select v-model="zona" @change="onZona">
          <option value="">Selecciona zona…</option>
          <option v-for="z in zonas" :key="z.Zona" :value="z.Zona">{{ z.Zona }} ({{ z.Tiendas }})</option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': filtroTienda }">
        <label>Tienda</label>
        <select v-model="filtroTienda" :disabled="!zona">
          <option value="">Todas las de la zona</option>
          <option v-for="t in tiendas" :key="t.codTienda" :value="t.codTienda">{{ t.tienda }}</option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': fecha }">
        <label>Fecha</label>
        <input type="date" v-model="fecha" @change="cargar" />
      </div>
    </div>

    <p v-if="loading" class="page__hint">Cargando tiendas…</p>
    <div v-else-if="zona && !bancos.length" class="empty card">
      No hay bancos configurados. Pide a un administrador que los agregue en <b>Admin → Bancos</b>.
    </div>
    <template v-else-if="zona && visibles.length">
      <div class="seleccion-bar">
        <span>Tiendas: <b>{{ visibles.length }}</b></span>
        <span>Total saldo: <b>{{ money(totalSaldo) }} Bs</b></span>
        <button class="btn btn--primary btn--sm" :disabled="busy" @click="guardar">Guardar</button>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead>
          <tr>
            <th>Tienda</th><th>Marca</th>
            <th v-for="b in bancos" :key="b.IdBanco" class="r">{{ b.Nombre }}</th>
            <th class="r">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in visibles" :key="t.codTienda">
            <td><b>{{ t.tienda }}</b></td>
            <td>{{ t.marca || '—' }}</td>
            <td v-for="b in bancos" :key="b.IdBanco" class="r">
              <InputMonto class="monto-input" v-model="montos[t.codTienda][b.IdBanco]" />
            </td>
            <td class="r"><b>{{ money(totalTienda(t)) }}</b></td>
          </tr>
        </tbody>
      </table></div>
      <div style="margin-top:14px">
        <button class="btn btn--primary" :disabled="busy" @click="guardar">Guardar saldos del {{ fechaLabel }}</button>
      </div>
    </template>
    <div v-else-if="zona" class="empty card">No hay tiendas para mostrar.</div>
    <p v-else class="page__hint">Elige una zona arriba.</p>

    <ModalFeedback :visible="modal.visible" :titulo="modal.titulo" :mensaje="modal.mensaje" :tipo="modal.tipo" @close="modal.visible = false" />
  </section>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import ModalFeedback from '../components/ModalFeedback.vue';
import InputMonto from '../components/InputMonto.vue';
import { getZonas } from '../api/facturas';
import { getFondosZona, guardarFondos } from '../api/fondos';
import { getBancos } from '../api/bancos';
import { money, hoyVE } from '../utils/format';
import { useAvisoSalida } from '../composables/useAvisoSalida';

const zonas = ref([]);
const zona = ref('');
const filtroTienda = ref('');
const fecha = ref(hoyVE());
const tiendas = ref([]);
const bancos = ref([]);
const montos = ref({});   // montos[codTienda][idBanco] = valor del input
const loading = ref(false);
const busy = ref(false);
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });

// Sucio = hay montos escritos por el usuario que no se han guardado todavía.
const sucio = ref(false);
watch(montos, () => { sucio.value = true; }, { deep: true });
useAvisoSalida(sucio);

const visibles = computed(() => (filtroTienda.value
  ? tiendas.value.filter((t) => Number(t.codTienda) === Number(filtroTienda.value))
  : tiendas.value));

const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);
const totalTienda = (t) => bancos.value.reduce((a, b) => a + num(montos.value[t.codTienda]?.[b.IdBanco]), 0);
const totalSaldo = computed(() => visibles.value.reduce((a, t) => a + totalTienda(t), 0));
const fechaLabel = computed(() => fecha.value.split('-').reverse().join('/'));

async function onZona() {
  filtroTienda.value = '';
  await cargar();
}
async function cargar() {
  tiendas.value = []; montos.value = {};
  await nextTick();
  sucio.value = false; // limpiar la tabla tampoco cuenta como cambio sin guardar
  if (!zona.value || !fecha.value) return;
  loading.value = true;
  try {
    const data = await getFondosZona(zona.value, fecha.value);
    tiendas.value = data;
    const m = {};
    data.forEach((t) => {
      m[t.codTienda] = {};
      bancos.value.forEach((b) => {
        const v = t.bancos?.[b.IdBanco];
        m[t.codTienda][b.IdBanco] = v != null ? Number(v) : '';
      });
    });
    montos.value = m;
    await nextTick();
    sucio.value = false; // la carga inicial no cuenta como cambio sin guardar
  } finally { loading.value = false; }
}

async function guardar() {
  const items = [];
  visibles.value.forEach((t) => {
    bancos.value.forEach((b) => {
      const v = montos.value[t.codTienda]?.[b.IdBanco];
      if (v !== '' && v != null && Number.isFinite(Number(v))) {
        items.push({ codTienda: t.codTienda, idBanco: b.IdBanco, monto: Number(v) });
      }
    });
  });
  if (!items.length) {
    modal.value = { visible: true, titulo: 'Nada que guardar', mensaje: 'Ingresa al menos un saldo.', tipo: 'warn' };
    return;
  }
  busy.value = true;
  try {
    const r = await guardarFondos({ fecha: fecha.value, items });
    sucio.value = false;
    modal.value = { visible: true, titulo: 'Saldos guardados', mensaje: `Se guardaron ${r.guardadas} registro(s) para el ${fechaLabel.value}.`, tipo: 'success' };
  } catch (e) {
    modal.value = { visible: true, titulo: 'Error', mensaje: e.response?.data?.error || 'No se pudo guardar.', tipo: 'error' };
  } finally { busy.value = false; }
}

onMounted(async () => {
  [zonas.value, bancos.value] = await Promise.all([getZonas(), getBancos()]);
});
</script>

<style scoped>
.monto-input { width: 110px; padding: 7px 8px; border: 1px solid var(--border); border-radius: 7px; font-size: 13px; text-align: right; outline: none; }
.monto-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
</style>
