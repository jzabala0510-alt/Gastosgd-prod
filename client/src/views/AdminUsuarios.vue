<template>
  <section class="page">
    <div v-if="popAbierto !== null" class="zona-overlay" @click="popAbierto = null"></div>
    <div class="page__head">
      <div>
        <h1 class="page__title">Administración de usuarios</h1>
        <p class="page__hint">Marca los roles de cada usuario (puede tener varios). Solo quienes tengan al menos un rol entran; cada rol habilita su módulo.</p>
      </div>
    </div>

    <div class="card filtros">
      <div class="field" :class="{ 'field--active': q }" style="flex:2">
        <label>Buscar usuario</label>
        <input v-model="q" placeholder="Nombre de usuario…" />
      </div>
      <div class="field" :class="{ 'field--active': soloConAcceso }">
        <label>Mostrar</label>
        <select v-model="soloConAcceso">
          <option :value="false">Todos</option>
          <option :value="true">Solo con acceso</option>
        </select>
      </div>
    </div>

    <p v-if="loading" class="page__hint">Cargando usuarios…</p>
    <template v-else>
      <p class="page__hint"><b>{{ conAcceso }}</b> con acceso · {{ usuarios.length }} usuarios ICG · {{ filtrados.length }} mostrados</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Usuario</th><th>Roles (qué puede hacer)</th><th>Zonas (dónde trabaja)</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in paginadas" :key="u.codUsuarioIcg" :class="{ sel: u._saved }">
            <td><b>{{ u.usuario }}</b></td>
            <td>
              <div class="roles-pick">
                <label v-for="r in ROLES" :key="r" class="role-chip" :class="{ on: u.roles.includes(r) }">
                  <input type="checkbox" :checked="u.roles.includes(r)" :disabled="u._saving"
                    @change="toggleRol(u, r, $event.target.checked)" />
                  {{ ROL_LABEL[r] }}
                </label>
              </div>
            </td>
            <td>
              <div v-if="u.roles.length" class="zona-cell">
                <button class="zona-cell__btn" :class="{ on: u.zonas.length }" @click="togglePop(u)">
                  <span>{{ u.zonas.length ? u.zonas.join(', ') : 'Todas las zonas' }}</span>
                  <span class="zona-cell__caret">▾</span>
                </button>
                <div v-if="popAbierto === u.codUsuarioIcg" class="zona-pop">
                  <label class="zona-opt">
                    <input type="checkbox" :checked="!u.zonas.length" :disabled="u._saving" @change="guardarZonas(u, [])" />
                    <b>Todas las zonas</b>
                  </label>
                  <div class="zona-pop__sep"></div>
                  <label v-for="z in zonasDisp" :key="z.Zona" class="zona-opt">
                    <input type="checkbox" :checked="u.zonas.includes(z.Zona)" :disabled="u._saving"
                      @change="toggleZona(u, z.Zona, $event.target.checked)" />
                    {{ z.Zona }}
                  </label>
                </div>
              </div>
              <span v-else class="page__hint">—</span>
            </td>
            <td>
              <span class="badge" :class="u.roles.length ? 'badge--green' : 'badge--gray'">
                {{ u.roles.length ? 'Activo' : 'Sin acceso' }}
              </span>
            </td>
            <td class="r">
              <span v-if="u._saving" class="page__hint">Guardando…</span>
              <span v-else-if="u._saved" class="badge badge--green">✓ Guardado</span>
              <span v-else-if="u._error" class="badge badge--red">{{ u._error }}</span>
            </td>
          </tr>
        </tbody>
      </table></div>
      <p v-if="!filtrados.length" class="page__hint">Sin resultados.</p>

      <div class="paginacion" v-if="totalPaginas > 1">
        <button class="btn btn--sm" :disabled="pagina === 1" @click="pagina--">← Anterior</button>
        <span>Página <b>{{ pagina }}</b> de {{ totalPaginas }}</span>
        <button class="btn btn--sm" :disabled="pagina === totalPaginas" @click="pagina++">Siguiente →</button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { getUsuarios, setUsuario, setUsuarioZonas } from '../api/admin';
import { getZonas } from '../api/facturas';

const ROLES = ['ANALISTA', 'TESORERIA', 'AUDITOR', 'PAGADOR', 'SALDOS', 'REPORTES', 'ADMIN'];
const ROL_LABEL = { ANALISTA: 'Analista', TESORERIA: 'Tesorería', AUDITOR: 'Auditor', PAGADOR: 'Pagos', SALDOS: 'Saldos', REPORTES: 'Reportes', ADMIN: 'Administrador' };
const PORPAGINA = 15;

const usuarios = ref([]);
const zonasDisp = ref([]);
const popAbierto = ref(null); // codUsuarioIcg con el desplegable de zonas abierto
const loading = ref(false);
const q = ref('');
const soloConAcceso = ref(false);
const pagina = ref(1);

function togglePop(u) { popAbierto.value = popAbierto.value === u.codUsuarioIcg ? null : u.codUsuarioIcg; }

const conAcceso = computed(() => usuarios.value.filter((u) => u.roles.length).length);
const filtrados = computed(() => {
  const term = q.value.trim().toLowerCase();
  return usuarios.value.filter((u) => {
    if (soloConAcceso.value && !u.roles.length) return false;
    if (term && !(u.usuario || '').toLowerCase().includes(term)) return false;
    return true;
  });
});
const totalPaginas = computed(() => Math.max(1, Math.ceil(filtrados.value.length / PORPAGINA)));
const paginadas = computed(() => filtrados.value.slice((pagina.value - 1) * PORPAGINA, pagina.value * PORPAGINA));

watch([q, soloConAcceso], () => { pagina.value = 1; });

async function guardar(u, payload) {
  u._saving = true; u._saved = false; u._error = '';
  try {
    const res = await setUsuario(u.codUsuarioIcg, payload);
    u.roles = res.roles || [];
    u._saved = true;
    setTimeout(() => { u._saved = false; }, 2000);
  } catch (e) {
    u._error = e.response?.data?.error || 'No se pudo guardar';
    setTimeout(() => { u._error = ''; }, 4000);
  } finally { u._saving = false; }
}
function toggleRol(u, rol, checked) {
  const set = new Set(u.roles);
  if (checked) set.add(rol); else set.delete(rol);
  guardar(u, { roles: [...set] });
}

async function guardarZonas(u, zonas) {
  u._saving = true; u._saved = false; u._error = '';
  try {
    const res = await setUsuarioZonas(u.codUsuarioIcg, zonas);
    u.zonas = res.zonas || [];
    u._saved = true;
    setTimeout(() => { u._saved = false; }, 2000);
  } catch (e) {
    u._error = e.response?.data?.error || 'No se pudo guardar';
    setTimeout(() => { u._error = ''; }, 4000);
  } finally { u._saving = false; }
}
function toggleZona(u, zona, checked) {
  const set = new Set(u.zonas);
  if (checked) set.add(zona); else set.delete(zona);
  guardarZonas(u, [...set]);
}

onMounted(async () => {
  loading.value = true;
  try {
    const [data, zonas] = await Promise.all([getUsuarios(), getZonas()]);
    usuarios.value = data.map((u) => ({ ...u, roles: u.roles || [], zonas: u.zonas || [], _saving: false, _saved: false, _error: '' }));
    zonasDisp.value = zonas;
  } finally { loading.value = false; }
});
</script>

<style scoped>
.roles-pick { display: flex; flex-wrap: wrap; gap: 6px; }
.role-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; font-size: 12px; cursor: pointer; user-select: none; white-space: nowrap; }
.role-chip.on { background: var(--accent-soft); border-color: var(--accent); color: #4f6f17; font-weight: 600; }
.role-chip input { margin: 0; cursor: pointer; }

/* Alcance por zona */
.zona-cell { position: relative; display: inline-block; }
.zona-cell__btn {
  display: inline-flex; align-items: center; gap: 8px; max-width: 240px;
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
