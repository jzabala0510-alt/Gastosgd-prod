<template>
  <div class="buscador-tienda" @keydown.esc="cerrar">
    <input
      type="text"
      class="buscador-tienda__input"
      v-model="texto"
      :placeholder="placeholder"
      @focus="abierto = true"
      @input="abierto = true"
      @blur="onBlur"
    />
    <ul v-if="abierto && opciones.length" class="buscador-tienda__lista">
      <li v-for="t in opciones" :key="t.CodTienda" @mousedown.prevent="elegir(t)">
        <b>{{ t.Tienda }}</b>
        <small>{{ t.Marca }} · {{ t.Zona || 'NACIONALES' }} · #{{ t.CodTienda }}</small>
      </li>
    </ul>
    <ul v-else-if="abierto && texto.trim()" class="buscador-tienda__lista">
      <li class="buscador-tienda__vacio">Sin resultados</li>
    </ul>
  </div>
</template>

<script setup>
// Combobox de texto libre para elegir cualquier tienda del ERP. Los
// selectores existentes (SelectorTienda/SelectorZMT) dependen de elegir
// zona primero; aquí hace falta buscar cualquiera de un tirón, porque la
// fila del Excel puede venir con la zona/marca mal puesta.
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: [Number, String], default: null },
  tiendas: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Buscar tienda…' },
});
const emit = defineEmits(['update:modelValue']);

const norm = (s) => String(s || '').toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9]+/g, ' ').trim();

const texto = ref('');
const abierto = ref(false);

function etiquetaDe(cod) {
  const t = props.tiendas.find((x) => x.CodTienda === cod);
  return t ? `${t.Tienda} — ${t.Marca}` : '';
}
watch(() => props.modelValue, (v) => { texto.value = v ? etiquetaDe(v) : ''; }, { immediate: true });
watch(() => props.tiendas, () => { if (props.modelValue) texto.value = etiquetaDe(props.modelValue); });

const opciones = computed(() => {
  const q = norm(texto.value);
  if (!q) return [];
  return props.tiendas
    .filter((t) => norm(`${t.Tienda} ${t.Marca} ${t.Zona}`).includes(q))
    .slice(0, 30);
});

function elegir(t) {
  emit('update:modelValue', t.CodTienda);
  texto.value = `${t.Tienda} — ${t.Marca}`;
  abierto.value = false;
}
function cerrar() { abierto.value = false; }
function onBlur() {
  // pequeño delay para que el @mousedown.prevent de la opción alcance a disparar antes de cerrar
  setTimeout(() => { abierto.value = false; }, 150);
}
</script>

<style scoped>
.buscador-tienda { position: relative; width: 100%; min-width: 220px; }
.buscador-tienda__input {
  width: 100%; padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px;
  font-size: 13px; outline: none; font-family: inherit; box-sizing: border-box;
}
.buscador-tienda__input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.buscador-tienda__lista {
  position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0;
  max-height: 260px; overflow-y: auto; background: #fff; border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.12); list-style: none; margin: 0; padding: 4px;
}
.buscador-tienda__lista li { padding: 7px 9px; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; gap: 1px; }
.buscador-tienda__lista li:hover { background: var(--accent-soft); }
.buscador-tienda__lista li b { font-size: 13px; color: var(--text); }
.buscador-tienda__lista li small { font-size: 11px; color: var(--muted); }
.buscador-tienda__vacio { color: var(--muted); cursor: default; }
.buscador-tienda__vacio:hover { background: transparent; }
</style>
