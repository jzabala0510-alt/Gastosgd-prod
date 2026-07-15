<template>
  <div class="acciones">
    <textarea v-model="comentario" rows="2" :placeholder="placeholder"></textarea>
    <div class="acciones__btns">
      <button class="btn btn--primary" :disabled="busy || disabledAprobar" @click="emitir('APROBADO')">{{ aprobarLabel }}</button>
      <button v-if="!soloAprobar" class="btn btn--warn" :disabled="busy" @click="emitir('DEVUELTO')">Devolver</button>
      <button v-if="!soloAprobar" class="btn btn--danger" :disabled="busy" @click="emitir('RECHAZADO')">Rechazar</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({ busy: Boolean, disabledAprobar: Boolean, placeholder: { type: String, default: 'Comentario (opcional)' }, aprobarLabel: { type: String, default: 'Aprobar' }, soloAprobar: Boolean });
const emit = defineEmits(['decidir']);
const comentario = ref('');

function emitir(decision) { emit('decidir', { decision, comentario: comentario.value }); }
</script>
