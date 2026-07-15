<template>
  <Teleport to="body">
    <Transition name="mfb">
      <div v-if="confirmState.visible" class="mfb-overlay" @click.self="cancelar">
        <div class="mfb-box mfc-box">
          <div class="mfb-icon" :class="`mfb-icon--${confirmState.tipo}`">
            <span v-if="confirmState.tipo === 'danger'">✕</span>
            <span v-else-if="confirmState.tipo === 'info'">i</span>
            <span v-else>!</span>
          </div>
          <h3 class="mfb-titulo">{{ confirmState.titulo }}</h3>
          <p v-if="confirmState.mensaje" class="mfb-mensaje">{{ confirmState.mensaje }}</p>

          <textarea
            v-if="confirmState.pedirComentario"
            v-model="confirmState.comentario"
            rows="3"
            class="mfc-textarea"
            :placeholder="confirmState.placeholder"
          ></textarea>

          <div class="mfc-btns">
            <button class="btn" @click="cancelar">{{ confirmState.labelCancelar }}</button>
            <button class="btn" :class="btnClase" :disabled="bloqueado" @click="aceptar">{{ confirmState.labelConfirmar }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { useConfirm } from '../composables/useConfirm';

const { confirmState, responder } = useConfirm();

const btnClase = computed(() => ({
  danger: 'btn--danger', warn: 'btn--warn', info: 'btn--primary',
}[confirmState.tipo] || 'btn--primary'));

const bloqueado = computed(() =>
  confirmState.pedirComentario && confirmState.comentarioRequerido && !confirmState.comentario.trim());

function aceptar() { if (!bloqueado.value) responder(true); }
function cancelar() { responder(false); }
</script>

<style scoped>
.mfb-overlay {
  position: fixed; inset: 0; z-index: 9100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.35); backdrop-filter: blur(2px);
}
.mfb-box {
  background: #fff;
  border-radius: 16px;
  padding: 32px 36px;
  min-width: 300px; max-width: 420px;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
}
.mfb-icon {
  width: 56px; height: 56px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 700; margin-bottom: 16px;
}
.mfb-icon--warn   { background: #fef3c7; color: #d97706; }
.mfb-icon--danger { background: #fee2e2; color: #dc2626; }
.mfb-icon--info   { background: #dbeafe; color: #2563eb; }

.mfb-titulo  { margin: 0 0 6px; font-size: 1.1rem; font-weight: 700; color: var(--text, #202020); }
.mfb-mensaje { margin: 0; font-size: .9rem; color: var(--muted, #6b7280); line-height: 1.45; }

.mfc-textarea {
  width: 100%; margin-top: 16px; box-sizing: border-box;
  border: 1.5px solid var(--border, #e5e7eb); border-radius: 9px;
  padding: 10px 12px; font-size: .9rem; font-family: inherit; resize: vertical;
  color: var(--text, #202020);
}
.mfc-textarea:focus { outline: none; border-color: var(--accent, #86bb25); box-shadow: 0 0 0 3px rgba(134,187,37,.18); }

.mfc-btns { display: flex; gap: 10px; margin-top: 22px; }
.mfc-btns .btn { flex: 1; }

.mfb-enter-active, .mfb-leave-active { transition: opacity .2s, transform .2s; }
.mfb-enter-from, .mfb-leave-to { opacity: 0; transform: scale(.92); }
</style>
