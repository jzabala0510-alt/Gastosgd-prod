<template>
  <div class="selector">
    <div class="field">
      <label>Zona</label>
      <select v-model="store.zona" @change="onZona">
        <option value="">Selecciona zona…</option>
        <option v-for="z in zonas" :key="z.Zona" :value="z.Zona">{{ z.Zona }} ({{ z.Tiendas }})</option>
      </select>
    </div>
    <div class="field">
      <label>Marca</label>
      <select v-model="store.marca" @change="onMarca" :disabled="!store.zona">
        <option value="">{{ store.zona ? 'Todas las marcas' : 'Elige una zona' }}</option>
        <option v-for="m in marcas" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>
    <div class="field">
      <label>Tienda</label>
      <select v-model="store.codTienda" :disabled="!store.zona">
        <option :value="null">Todas las tiendas</option>
        <option v-for="t in tiendas" :key="t.CodTienda" :value="t.CodTienda">{{ t.Tienda }}<template v-if="!store.marca"> — {{ t.Marca }}</template></option>
      </select>
    </div>
    <div class="selector__accion">
      <button class="btn btn--primary" :disabled="!store.zona" @click="buscar">🔍 Buscar</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { getZonas, getMarcas, getTiendas } from '../api/facturas';

const props = defineProps({ store: { type: Object, required: true } });
const emit = defineEmits(['buscar']);

const zonas = ref([]);
const marcas = ref([]);
const tiendas = ref([]);

async function loadMarcas() { marcas.value = props.store.zona ? await getMarcas(props.store.zona) : []; }
async function loadTiendas() {
  tiendas.value = props.store.zona ? await getTiendas(props.store.zona, props.store.marca) : [];
  props.store.tiendas = [...tiendas.value];
}

// Cambiar zona/marca solo ajusta las listas dependientes; la búsqueda es MANUAL (botón).
async function onZona() { props.store.marca = ''; props.store.codTienda = null; await loadMarcas(); await loadTiendas(); }
async function onMarca() { props.store.codTienda = null; await loadTiendas(); }

function buscar() { emit('buscar', props.store.codTienda ? Number(props.store.codTienda) : null); }

// Recarga las listas (marcas/tiendas) según el store, sin ejecutar la búsqueda.
async function restaurar() {
  if (!props.store.zona) return;
  await loadMarcas();
  await loadTiendas();
}

// Salto desde notificaciones: store.autobuscar=true → recargar listas y buscar automáticamente.
watch(() => props.store.autobuscar, async (v) => {
  if (!v) return;
  props.store.autobuscar = false;
  await restaurar();
  buscar();
});

onMounted(async () => {
  zonas.value = await getZonas();
  await restaurar();
  if (props.store.autobuscar) { props.store.autobuscar = false; buscar(); }
});
defineExpose({ restaurar });
</script>
