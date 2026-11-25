<template>
  <span v-if="pagador" class="badge badge--pagador" :class="{ 'badge--pagador-mayor': !pagador.esTienda, 'badge--icg-bloque': bloque }"
        :title="pagador.esTienda ? 'Este gasto lo paga la propia tienda.' : `Este gasto lo paga ${pagador.nombre}.`">
    Paga: {{ pagador.nombre }}
  </span>
</template>

<script setup>
// "Se paga por": la empresa que va a pagar el gasto (la tienda o una mayor), elegida por el
// Analista al meterlo al flujo. pagador: { codTienda, nombre, esTienda } o null.
// bloque: en su propia línea, debajo del contenido de la celda.
defineProps({ pagador: { type: Object, default: null }, bloque: { type: Boolean, default: false } });
</script>
