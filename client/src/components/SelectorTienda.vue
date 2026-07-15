<template>
  <div class="selector">
    <div class="field">
      <label>Zona</label>
      <select v-model="zona" @change="onZona">
        <option value="">Selecciona zona…</option>
        <option v-for="z in zonas" :key="z.Zona" :value="z.Zona">{{ z.Zona }} ({{ z.Tiendas }})</option>
      </select>
    </div>
    <div class="field">
      <label>Tienda</label>
      <select v-model="codTienda" @change="emitir" :disabled="!tiendas.length">
        <option value="">{{ tiendas.length ? 'Selecciona tienda…' : 'Elige una zona' }}</option>
        <option v-for="t in tiendas" :key="t.CodTienda" :value="t.CodTienda">{{ t.Tienda }} — {{ t.Marca }}</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getZonas, getTiendas } from '../api/facturas';

const emit = defineEmits(['tienda']);
const zonas = ref([]);
const tiendas = ref([]);
const zona = ref('');
const codTienda = ref('');

async function onZona() {
  codTienda.value = '';
  tiendas.value = zona.value ? await getTiendas(zona.value) : [];
  emitir();
}
function emitir() { emit('tienda', codTienda.value ? Number(codTienda.value) : null); }

onMounted(async () => { zonas.value = await getZonas(); });
</script>
