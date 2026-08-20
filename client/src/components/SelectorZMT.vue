<template>
  <div class="selector">
    <div v-if="multiple && popAbierto" class="zona-overlay" @click="popAbierto = null"></div>
    <div class="field">
      <label>Zona</label>
      <select v-model="store.zona" @change="onZona">
        <option value="">Selecciona zona…</option>
        <option v-for="z in zonas" :key="z.Zona" :value="z.Zona">{{ z.Zona }} ({{ z.Tiendas }})</option>
      </select>
    </div>

    <div class="field" v-if="!multiple">
      <label>Marca</label>
      <select v-model="store.marca" @change="onMarca" :disabled="!store.zona">
        <option value="">{{ store.zona ? 'Todas las marcas' : 'Elige una zona' }}</option>
        <option v-for="m in marcas" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>
    <div class="field" v-else>
      <label>Marca</label>
      <div class="zona-cell">
        <button type="button" class="zona-cell__btn" :class="{ on: store.marcasSel.length }"
          :disabled="!store.zona" @click="popAbierto = popAbierto === 'marca' ? null : 'marca'">
          <span>{{ store.marcasSel.length ? store.marcasSel.join(', ') : 'Todas las marcas' }}</span>
          <span class="zona-cell__caret">▾</span>
        </button>
        <div v-if="popAbierto === 'marca'" class="zona-pop">
          <label class="zona-opt">
            <input type="checkbox" :checked="!store.marcasSel.length" @change="onTodasMarcas" />
            <b>Todas las marcas</b>
          </label>
          <div class="zona-pop__sep"></div>
          <label v-for="m in marcas" :key="m" class="zona-opt">
            <input type="checkbox" :checked="store.marcasSel.includes(m)" @change="toggleMarca(m, $event.target.checked)" />
            {{ m }}
          </label>
        </div>
      </div>
    </div>

    <div class="field" v-if="!multiple">
      <label>Tienda</label>
      <select v-model="store.codTienda" :disabled="!store.zona">
        <option :value="null">Todas las tiendas</option>
        <option v-for="t in tiendas" :key="t.CodTienda" :value="t.CodTienda">{{ t.Tienda }}<template v-if="!store.marca"> — {{ t.Marca }}</template></option>
      </select>
    </div>
    <div class="field" v-else>
      <label>Tienda</label>
      <div class="zona-cell">
        <button type="button" class="zona-cell__btn" :class="{ on: store.tiendasSel.length }"
          :disabled="!store.zona" @click="popAbierto = popAbierto === 'tienda' ? null : 'tienda'">
          <span>{{ store.tiendasSel.length ? store.tiendasSel.map((t) => t.Tienda).join(', ') : 'Todas las tiendas' }}</span>
          <span class="zona-cell__caret">▾</span>
        </button>
        <div v-if="popAbierto === 'tienda'" class="zona-pop">
          <label class="zona-opt">
            <input type="checkbox" :checked="!store.tiendasSel.length" @change="onTodasTiendas" />
            <b>Todas las tiendas</b>
          </label>
          <div class="zona-pop__sep"></div>
          <label v-for="t in tiendas" :key="t.CodTienda" class="zona-opt">
            <input type="checkbox" :checked="store.tiendasSel.some((x) => x.CodTienda === t.CodTienda)"
              @change="toggleTienda(t, $event.target.checked)" />
            {{ t.Tienda }}<template v-if="!store.marcasSel.length"> — {{ t.Marca }}</template>
          </label>
        </div>
      </div>
    </div>

    <div class="selector__accion">
      <button class="btn btn--primary" :disabled="!store.zona" @click="buscar">🔍 Buscar</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { getZonas, getMarcas, getTiendas } from '../api/facturas';

const props = defineProps({
  store: { type: Object, required: true },
  // Cuando es true, Marca y Tienda se muestran como selector múltiple (checkboxes en
  // popover) en vez de <select> de una sola opción. Solo lo usa Tesorería; el resto de
  // las vistas no pasan esta prop y no cambian.
  multiple: { type: Boolean, default: false },
});
const emit = defineEmits(['buscar']);

const zonas = ref([]);
const marcas = ref([]);
const tiendas = ref([]);
const popAbierto = ref(null); // 'marca' | 'tienda' | null — solo se usa cuando multiple=true

async function loadMarcas() { marcas.value = props.store.zona ? await getMarcas(props.store.zona) : []; }
async function loadTiendas() {
  tiendas.value = props.store.zona ? await getTiendas(props.store.zona, props.store.marca) : [];
  props.store.tiendas = [...tiendas.value];
}

// Selector múltiple (multiple=true): `tiendas` pasa a ser la unión de tiendas de las
// marcas marcadas (o todas las de la zona si no hay ninguna marcada), para poblar el
// popover de Tienda. Poda tiendasSel si alguna tienda elegida deja de aplicar.
async function loadTiendasMulti() {
  const z = props.store.zona;
  if (!z) { tiendas.value = []; props.store.tiendas = []; return; }
  const elegidas = props.store.marcasSel;
  if (!elegidas.length) {
    tiendas.value = await getTiendas(z, '');
  } else {
    const listas = await Promise.all(elegidas.map((m) => getTiendas(z, m)));
    const porCod = new Map();
    listas.flat().forEach((t) => porCod.set(t.CodTienda, t));
    tiendas.value = [...porCod.values()];
  }
  props.store.tiendas = [...tiendas.value];
  props.store.tiendasSel = props.store.tiendasSel.filter((t) => tiendas.value.some((x) => x.CodTienda === t.CodTienda));
}
function toggleMarca(m, checked) {
  const set = new Set(props.store.marcasSel);
  if (checked) set.add(m); else set.delete(m);
  props.store.marcasSel = [...set];
  loadTiendasMulti();
}
function onTodasMarcas() {
  props.store.marcasSel = [];
  loadTiendasMulti();
}
function toggleTienda(t, checked) {
  const map = new Map(props.store.tiendasSel.map((x) => [x.CodTienda, x]));
  if (checked) map.set(t.CodTienda, t); else map.delete(t.CodTienda);
  props.store.tiendasSel = [...map.values()];
}
function onTodasTiendas() { props.store.tiendasSel = []; }

// Cambiar zona/marca solo ajusta las listas dependientes; la búsqueda es MANUAL (botón).
async function onZona() {
  props.store.marca = ''; props.store.codTienda = null;
  await loadMarcas();
  if (props.multiple) { props.store.marcasSel = []; props.store.tiendasSel = []; await loadTiendasMulti(); }
  else { await loadTiendas(); }
}
async function onMarca() { props.store.codTienda = null; await loadTiendas(); }

function buscar() { emit('buscar', props.store.codTienda ? Number(props.store.codTienda) : null); }

// Recarga las listas (marcas/tiendas) según el store, sin ejecutar la búsqueda.
async function restaurar() {
  if (!props.store.zona) return;
  await loadMarcas();
  if (props.multiple) await loadTiendasMulti(); else await loadTiendas();
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

<style scoped>
/* Selector múltiple de Marca/Tienda (multiple=true) — mismo patrón que el selector de
   zonas por usuario en AdminUsuarios.vue (duplicado aquí a propósito: son estilos
   scoped, no hay colisión, y así este componente no depende de otro para renderizarse). */
.zona-cell { position: relative; display: inline-block; width: 100%; }
.zona-cell__btn {
  display: inline-flex; align-items: center; gap: 8px; width: 100%;
  padding: 5px 12px; border: 1px solid var(--border); border-radius: 8px;
  background: #fff; font: inherit; font-size: 13px; cursor: pointer; color: #6b7280;
}
.zona-cell__btn.on { border-color: var(--accent); color: #4f6f17; font-weight: 600; }
.zona-cell__btn span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zona-cell__caret { flex-shrink: 0; font-size: 10px; }
.zona-pop {
  position: absolute; z-index: 40; top: calc(100% + 4px); left: 0; min-width: 200px; max-height: 280px;
  overflow-y: auto; background: #fff; border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.14); padding: 6px;
}
.zona-opt { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.zona-opt:hover { background: #f9fafb; }
.zona-opt input { margin: 0; cursor: pointer; }
.zona-pop__sep { height: 1px; background: #eef0f2; margin: 4px 2px; }
.zona-overlay { position: fixed; inset: 0; z-index: 30; }
</style>
