<template>
  <Teleport to="body">
    <Transition name="mfb">
      <div v-if="visible" class="mfb-overlay">
        <div class="mfb-box">
          <div class="mfb-icon" :class="`mfb-icon--${tipo}`">
            <span v-if="tipo === 'success'">✓</span>
            <span v-else-if="tipo === 'warn'">!</span>
            <span v-else>✕</span>
          </div>
          <h3 class="mfb-titulo">{{ titulo }}</h3>
          <p v-if="mensaje" class="mfb-mensaje">{{ mensaje }}</p>
          <div class="mfb-barra">
            <div class="mfb-barra__fill" :style="{ animationDuration: duracion + 'ms' }"></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { watch } from 'vue';

const props = defineProps({
  visible: Boolean,
  titulo: { type: String, default: 'Listo' },
  mensaje: { type: String, default: '' },
  tipo: { type: String, default: 'success' },   // success | warn | error
  duracion: { type: Number, default: 2200 },
});
const emit = defineEmits(['close']);

let timer = null;
watch(() => props.visible, (v) => {
  if (timer) { clearTimeout(timer); timer = null; }
  if (v) timer = setTimeout(() => emit('close'), props.duracion);
});
</script>

<style scoped>
.mfb-overlay {
  position: fixed; inset: 0; z-index: 9000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.35); backdrop-filter: blur(2px);
}
.mfb-box {
  background: var(--surface, #fff);
  border-radius: 16px;
  padding: 36px 44px;
  min-width: 280px; max-width: 380px;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
}
.mfb-icon {
  width: 56px; height: 56px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 700; margin-bottom: 16px;
}
.mfb-icon--success { background: #d1fae5; color: #059669; }
.mfb-icon--warn    { background: #fef3c7; color: #d97706; }
.mfb-icon--error   { background: #fee2e2; color: #dc2626; }

.mfb-titulo  { margin: 0 0 6px; font-size: 1.15rem; font-weight: 700; color: var(--text, #111); }
.mfb-mensaje { margin: 0 0 20px; font-size: .9rem; color: var(--text-muted, #555); line-height: 1.45; }

.mfb-barra { height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; margin-top: 20px; }
.mfb-barra__fill {
  height: 100%; border-radius: 2px;
  background: var(--color-primary, #16a34a);
  animation: mfb-shrink linear forwards;
}
@keyframes mfb-shrink { from { width: 100%; } to { width: 0%; } }

.mfb-enter-active, .mfb-leave-active { transition: opacity .2s, transform .2s; }
.mfb-enter-from, .mfb-leave-to { opacity: 0; transform: scale(.92); }
</style>
