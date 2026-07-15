<template>
  <input
    type="text"
    inputmode="decimal"
    :value="texto"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="onInput"
  />
</template>

<script setup>
// Input numérico con separador de miles en vivo (formato es-VE: punto de
// miles, coma decimal). El v-model expone siempre el número (o '' si está
// vacío), nunca el texto formateado.
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  modelValue: { type: [Number, String], default: '' },
  placeholder: { type: String, default: '0,00' },
  disabled: Boolean,
  permitirNegativo: Boolean, // ej. "Préstamo / ajuste", que sí puede ser negativo
});
const emit = defineEmits(['update:modelValue']);

function aTexto(n) {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
}
function aNumero(txt) {
  if (!txt || txt === '-') return '';
  const n = Number(txt.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : '';
}
// Deja solo dígitos, signo (si aplica) y una coma decimal, y agrega los puntos de miles.
function enmascarar(raw) {
  const neg = props.permitirNegativo && raw.trim().startsWith('-');
  let limpio = raw.replace(/[^\d,]/g, '');
  const i = limpio.indexOf(',');
  if (i !== -1) limpio = limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/,/g, '');
  const [ent, dec] = limpio.split(',');
  let entero = (ent || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let cuerpo = dec !== undefined ? `${entero || '0'},${dec.slice(0, 2)}` : entero;
  if (neg) cuerpo = cuerpo ? `-${cuerpo}` : '-';
  return cuerpo;
}

const texto = ref(props.modelValue === '' || props.modelValue == null ? '' : aTexto(Number(props.modelValue)));

function onInput(e) {
  const el = e.target;
  const posAntes = el.selectionStart;
  const digitosAntes = el.value.slice(0, posAntes).replace(/[^\d,-]/g, '').length;

  texto.value = enmascarar(el.value);
  emit('update:modelValue', aNumero(texto.value));

  nextTick(() => {
    let contados = 0, pos = 0;
    for (; pos < texto.value.length && contados < digitosAntes; pos++) {
      if (/[\d,-]/.test(texto.value[pos])) contados++;
    }
    el.setSelectionRange(pos, pos);
  });
}

// Sincroniza si el valor cambia desde afuera (ej. al cargar datos del servidor).
watch(() => props.modelValue, (v) => {
  const actual = aNumero(texto.value);
  if (v !== actual) texto.value = v === '' || v == null ? '' : aTexto(Number(v));
});
</script>
