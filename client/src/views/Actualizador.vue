<template>
  <div class="upd">
    <div class="upd__card">
      <h1 class="upd__title">Actualizador <span class="upd__version">v1</span></h1>
      <p class="upd__hint">Sección de administración interna, con clave propia (no las credenciales ICG).</p>

      <template v-if="!autenticado">
        <form @submit.prevent="entrar" class="upd__form">
          <div class="field">
            <label for="clave">Clave</label>
            <input id="clave" type="password" v-model="clave" autocomplete="off" required :disabled="loading" placeholder="••••••••" />
          </div>
          <p v-if="error" class="upd__error">{{ error }}</p>
          <button type="submit" class="btn btn--primary" :disabled="loading || !clave">
            {{ loading ? 'Verificando…' : 'Entrar' }}
          </button>
        </form>
      </template>

      <template v-else>
        <div class="upd__info card">
          <p><b>Repositorio:</b> {{ info.owner }}/{{ info.repo }}</p>
          <p><b>Branch:</b> {{ info.branch }}</p>
          <p v-if="ultimoResultado"><b>Última actualización aplicada:</b> {{ fecha(ultimoResultado.aplicadoEn) }}</p>
        </div>

        <p v-if="error" class="upd__error">{{ error }}</p>

        <template v-if="estadoAccion === 'reiniciando'">
          <p class="upd__reiniciando">
            <span class="upd__spinner"></span>
            Actualización aplicada. Esperando a que el servicio vuelva…
          </p>
        </template>
        <template v-else-if="estadoAccion === 'listo'">
          <p class="upd__ok">✓ El servicio volvió a responder. Actualización completa.</p>
        </template>

        <div class="upd__acciones">
          <button class="btn btn--primary" :disabled="busy" @click="confirmarActualizar">
            {{ busy ? 'Actualizando…' : 'Actualizar ahora' }}
          </button>
          <button class="btn" :disabled="busy" @click="salir">Salir</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { loginUpdater, estadoUpdater, actualizar as actualizarApi } from '../api/updater';
import { useConfirm } from '../composables/useConfirm';
import http from '../api/http';

const { confirm } = useConfirm();

const clave = ref('');
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const autenticado = ref(false);
const info = ref({ owner: null, repo: null, branch: null });
const ultimoResultado = ref(null);
const estadoAccion = ref(''); // '' | 'reiniciando' | 'listo'

function fecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-VE');
}

async function cargarEstado() {
  info.value = await estadoUpdater();
}

async function entrar() {
  error.value = '';
  loading.value = true;
  try {
    const { token } = await loginUpdater(clave.value);
    localStorage.setItem('gd_updater_token', token);
    autenticado.value = true;
    clave.value = '';
    await cargarEstado();
  } catch (e) {
    error.value = e.response?.data?.error || 'No se pudo verificar la clave.';
  } finally {
    loading.value = false;
  }
}

function salir() {
  localStorage.removeItem('gd_updater_token');
  autenticado.value = false;
  estadoAccion.value = '';
  ultimoResultado.value = null;
}

async function confirmarActualizar() {
  const { ok } = await confirm({
    titulo: 'Actualizar la aplicación',
    mensaje: 'Esto va a descargar la última versión del repositorio, sobreescribir el código de la app y reiniciar el servicio. ¿Continuar?',
    tipo: 'danger',
    labelConfirmar: 'Actualizar',
  });
  if (!ok) return;
  await ejecutarActualizacion();
}

async function ejecutarActualizacion() {
  error.value = '';
  busy.value = true;
  estadoAccion.value = '';
  try {
    const r = await actualizarApi();
    ultimoResultado.value = r;
    estadoAccion.value = 'reiniciando';
    await esperarReinicio();
    estadoAccion.value = 'listo';
  } catch (e) {
    error.value = e.response?.data?.error || 'No se pudo aplicar la actualización.';
  } finally {
    busy.value = false;
  }
}

// Espera a que /api/health vuelva a responder tras el reinicio del servicio.
function esperarReinicio() {
  const intentosMax = 40; // ~2 minutos a 3s cada intento
  let intento = 0;
  return new Promise((resolve) => {
    const tick = async () => {
      intento++;
      try {
        await http.get('/health', { timeout: 3000 });
        resolve();
        return;
      } catch {
        // El servicio está caído mientras reinicia — esperado, se reintenta.
      }
      if (intento >= intentosMax) { resolve(); return; }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 1500); // primer intento: darle un respiro a que el proceso salga
  });
}

onMounted(async () => {
  const token = localStorage.getItem('gd_updater_token');
  if (!token) return;
  try {
    await cargarEstado();
    autenticado.value = true;
  } catch {
    localStorage.removeItem('gd_updater_token');
  }
});
</script>

<style scoped>
.upd { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg, #f5f6f8); }
.upd__card { background: var(--surface, #fff); border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,.05), 0 20px 40px rgba(0,0,0,.08); padding: 36px 40px; width: 100%; max-width: 420px; }
.upd__title { margin: 0 0 6px; font-size: 20px; }
.upd__version { font-size: 12px; font-weight: 600; color: var(--muted, #6b7280); vertical-align: middle; }
.upd__hint { margin: 0 0 24px; font-size: 13px; color: var(--muted, #6b7280); }
.upd__form { display: flex; flex-direction: column; gap: 14px; }
.upd__error { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 10px; font-size: 13px; margin: 4px 0 0; }
.upd__info p { margin: 4px 0; font-size: 13px; }
.upd__acciones { display: flex; gap: 10px; margin-top: 16px; }
.upd__reiniciando { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted, #6b7280); margin: 12px 0 0; }
.upd__ok { color: #059669; font-weight: 600; font-size: 13px; margin: 12px 0 0; }
.upd__spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(0,0,0,.15); border-top-color: var(--accent, #16a34a); animation: upd-spin .7s linear infinite; }
@keyframes upd-spin { to { transform: rotate(360deg); } }
</style>
