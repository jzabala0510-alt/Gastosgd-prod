<template>
  <div class="upd">
    <div class="upd__card">
      <h1 class="upd__title">Actualizador <span class="upd__version">v2</span></h1>
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
          <p v-if="info.ultima"><b>Versión instalada:</b> <code>{{ corto(info.ultima.commit) }}</code> · {{ fecha(info.ultima.fecha) }}</p>
          <p v-else><b>Versión instalada:</b> sin registro (aún no se actualizó con esta versión del actualizador)</p>
        </div>
        <p v-if="info.pendiente" class="upd__error">Hay una actualización sin terminar de aplicar: reinicia el servicio para que se complete.</p>

        <p v-if="error" class="upd__error">{{ error }}</p>

        <template v-if="estadoAccion === 'reiniciando'">
          <p class="upd__reiniciando">
            <span class="upd__spinner"></span>
            Aplicando {{ ultimoResultado.archivos.length }} archivo(s){{ ultimoResultado.reinicia ? " y reiniciando el servicio" : "" }}…
          </p>
        </template>
        <template v-else-if="estadoAccion === 'listo'">
          <p class="upd__ok">✓ Actualización completa: versión <code>{{ corto(ultimoResultado.commit) }}</code>, {{ ultimoResultado.archivos.length }} archivo(s).</p>
          <p v-if="!ultimoResultado.reinicia" class="upd__hint upd__hint--sin-margen">Solo cambió el frontend: recarga la página (F5) para verlo.</p>
        </template>
        <template v-else-if="estadoAccion === 'sinCambios'">
          <p class="upd__ok">✓ Ya tienes la última versión (<code>{{ corto(ultimoResultado.commit) }}</code>); no había nada que actualizar.</p>
        </template>
        <details v-if="ultimoResultado && ultimoResultado.archivos.length" class="upd__archivos">
          <summary>Archivos actualizados ({{ ultimoResultado.archivos.length }})</summary>
          <ul><li v-for="a in ultimoResultado.archivos" :key="a"><code>{{ a }}</code></li></ul>
        </details>

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

const { confirm } = useConfirm();

const clave = ref('');
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const autenticado = ref(false);
const info = ref({ owner: null, repo: null, branch: null });
const ultimoResultado = ref(null);
const estadoAccion = ref(''); // '' | 'reiniciando' | 'listo' | 'sinCambios'

function fecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-VE');
}
const corto = (commit) => (commit ? commit.slice(0, 7) : '?');

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
    mensaje: 'Esto va a descargar la última versión del repositorio, reemplazar solo los archivos que cambiaron y, si cambió el backend, reiniciar el servicio. ¿Continuar?',
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
    if (!r.archivos.length) { estadoAccion.value = 'sinCambios'; return; }
    estadoAccion.value = 'reiniciando';
    const listo = await esperarAplicado(r.commit);
    await cargarEstado().catch(() => {});
    if (listo) estadoAccion.value = 'listo';
    else {
      estadoAccion.value = '';
      error.value = 'El servicio no confirmó la versión nueva. Revisa la consola del servidor y vuelve a entrar aquí para ver la versión instalada.';
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'No se pudo aplicar la actualización.';
  } finally {
    busy.value = false;
  }
}

// Espera a que el servicio vuelva y confirme que quedó instalado ese commit con todos
// sus archivos en su lugar (sin nada pendiente). true = confirmado.
function esperarAplicado(commit) {
  const intentosMax = 40; // ~2 minutos a 3s cada intento
  let intento = 0;
  return new Promise((resolve) => {
    const tick = async () => {
      intento++;
      try {
        const e = await estadoUpdater();
        if (!e.pendiente && e.ultima && (!commit || e.ultima.commit === commit)) { resolve(true); return; }
      } catch {
        // El servicio está caído mientras reinicia — esperado, se reintenta.
      }
      if (intento >= intentosMax) { resolve(false); return; }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000); // primer intento: darle tiempo a aplicar y reiniciar
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
.upd__hint--sin-margen { margin: 4px 0 0; }
.upd__archivos { margin-top: 10px; font-size: 12px; color: var(--muted, #6b7280); }
.upd__archivos ul { margin: 6px 0 0; padding-left: 18px; max-height: 160px; overflow-y: auto; }
.upd__spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(0,0,0,.15); border-top-color: var(--accent, #16a34a); animation: upd-spin .7s linear infinite; }
@keyframes upd-spin { to { transform: rotate(360deg); } }
</style>
