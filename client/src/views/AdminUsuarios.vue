<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Administración de usuarios</h1>
        <p class="page__hint">Cada usuario puede tener varios permisos y cada uno habilita su módulo; solo quienes tengan al menos uno entran. Usa "Editar permisos" para cambiarlos.</p>
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
        <thead><tr><th>Usuario</th><th>Permisos (qué puede hacer)</th><th>Zonas (dónde trabaja)</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in paginadas" :key="u.codUsuarioIcg" :class="{ sel: editando === u }">
            <td><b>{{ u.usuario }}</b></td>
            <td>
              <div v-if="u.roles.length" class="resumen">
                <span v-for="p in resumen(u)" :key="p.texto" class="resumen__chip" :class="`resumen__chip--${p.tipo}`" :title="p.titulo">{{ p.texto }}</span>
              </div>
              <span v-else class="page__hint">Sin permisos</span>
            </td>
            <td class="zonas-resumen" :title="u.zonas.join(', ')">{{ !u.roles.length ? '—' : (u.zonas.length ? u.zonas.join(', ') : 'Todas') }}</td>
            <td>
              <span class="badge" :class="u.roles.length ? 'badge--green' : 'badge--gray'">
                {{ u.roles.length ? 'Activo' : 'Sin acceso' }}
              </span>
            </td>
            <td class="r acciones-usuario">
              <span v-if="u._saving" class="page__hint">Guardando…</span>
              <span v-else-if="u._saved" class="badge badge--green">✓ Guardado</span>
              <span v-else-if="u._error" class="badge badge--red">{{ u._error }}</span>
              <button class="btn btn--sm" @click="abrir(u)">Editar permisos</button>
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

    <div v-if="editando" class="panel-overlay" @click="cerrar"></div>
    <aside v-if="editando" class="panel" role="dialog" aria-modal="true" :aria-label="`Permisos de ${editando.usuario}`">
      <div class="panel__head">
        <div>
          <h2 class="panel__titulo">Permisos de {{ editando.usuario }}</h2>
          <p class="panel__hint">
            Cada cambio se guarda al marcarlo.
            <span v-if="editando._saving">Guardando…</span>
            <span v-else-if="editando._saved" class="panel__ok">✓ Guardado</span>
          </p>
          <p v-if="editando._error" class="soporte-aviso panel__error">{{ editando._error }}</p>
        </div>
        <button class="panel__cerrar" aria-label="Cerrar" @click="cerrar">✕</button>
      </div>

      <section v-for="s in secciones" :key="s.nombre" class="panel__seccion">
        <h3 class="panel__seccion-titulo">{{ s.nombre }}</h3>
        <template v-if="s.zonas">
          <p v-if="!editando.roles.length" class="perm-nota perm-nota--sin-sangria">Asigna primero algún permiso.</p>
          <template v-else>
            <label class="perm">
              <input type="checkbox" :checked="!editando.zonas.length" :disabled="editando._saving" @change="todasLasZonas(editando, $event.target)" />
              <b>Todas las zonas</b>
            </label>
            <label v-for="z in zonasDisp" :key="z.Zona" class="perm perm--sub">
              <input type="checkbox" :checked="editando.zonas.includes(z.Zona)" :disabled="editando._saving"
                @change="toggleZona(editando, z.Zona, $event.target)" />
              {{ z.Zona }}
            </label>
          </template>
        </template>
        <template v-else>
          <template v-for="r in s.roles" :key="r.tag">
            <label class="perm">
              <input type="checkbox" :checked="editando.roles.includes(r.tag)" :disabled="editando._saving"
                @change="toggleRol(editando, r.tag, $event.target)" />
              {{ r.label }}
            </label>
            <p v-if="r.tag === 'REPORTES'" class="perm-nota">Sin marcar ninguno = ve todos los reportes</p>
            <!-- Un sub-permiso solo aplica con su módulo marcado: sin él queda gris, pero se
                 conserva lo marcado por si se vuelve a habilitar el módulo. -->
            <label v-for="h in r.hijos" :key="h.tag" class="perm perm--sub" :class="{ 'perm--inactivo': !editando.roles.includes(r.tag) }">
              <input type="checkbox" :checked="editando.roles.includes(h.tag)" :disabled="editando._saving || !editando.roles.includes(r.tag)"
                @change="toggleRol(editando, h.tag, $event.target)" />
              ↳ {{ h.shortLabel || h.label }}
            </label>
          </template>
        </template>
      </section>
    </aside>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { getUsuarios, setUsuario, setUsuarioZonas } from '../api/admin';
import { getZonas } from '../api/facturas';
import { ROLES_INFO, GRUPOS_PERMISOS, REPORTES_INFO } from '../utils/roles';

const PORPAGINA = 15;

// Secciones del panel: los módulos de cada grupo con sus sub-permisos anidados (ej.
// Pagos -> Devolver, Reportes -> cada reporte), y las zonas antes de Administración.
const grupos = GRUPOS_PERMISOS.map((nombre) => ({
  nombre,
  roles: ROLES_INFO.filter((r) => !r.parent && r.grupo === nombre)
    .map((r) => ({ ...r, hijos: ROLES_INFO.filter((h) => h.parent === r.tag) })),
}));
const secciones = [
  ...grupos.filter((g) => g.nombre !== 'Administración'),
  { nombre: 'Zonas (dónde trabaja)', zonas: true },
  ...grupos.filter((g) => g.nombre === 'Administración'),
];

const usuarios = ref([]);
const zonasDisp = ref([]);
const editando = ref(null); // usuario abierto en el panel de permisos
const loading = ref(false);
const q = ref('');
const soloConAcceso = ref(false);
const pagina = ref(1);

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

// Resumen corto para la tabla: los módulos que tiene, con "Devolver" y cuántos reportes.
function resumen(u) {
  const out = [];
  for (const r of ROLES_INFO.filter((x) => !x.parent)) {
    if (!u.roles.includes(r.tag)) continue;
    if (r.tag === 'REPORTES') {
      const marcados = REPORTES_INFO.filter((x) => u.roles.includes(x.tag)).map((x) => x.label);
      out.push({ texto: marcados.length ? `Reportes: ${marcados.length}` : 'Reportes: todos', tipo: 'reportes', titulo: marcados.join(', ') || 'Todos los reportes' });
      continue;
    }
    out.push({ texto: r.label, tipo: r.tag === 'ADMIN' ? 'admin' : 'modulo' });
    for (const h of ROLES_INFO.filter((x) => x.parent === r.tag)) {
      if (u.roles.includes(h.tag)) out.push({ texto: `↳ ${h.shortLabel || h.label}`, tipo: 'sub' });
    }
  }
  return out;
}

function abrir(u) { editando.value = u; }
function cerrar() { editando.value = null; }
const alTeclear = (e) => { if (e.key === 'Escape' && editando.value) cerrar(); };

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
// Al terminar, el checkbox se alinea con lo guardado: si el guardado falla, su valor
// enlazado no cambia y Vue no lo repinta, así que quedaría mostrando lo que no se guardó.
async function toggleRol(u, rol, el) {
  const set = new Set(u.roles);
  if (el.checked) set.add(rol); else set.delete(rol);
  await guardar(u, { roles: [...set] });
  el.checked = u.roles.includes(rol);
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
async function toggleZona(u, zona, el) {
  const set = new Set(u.zonas);
  if (el.checked) set.add(zona); else set.delete(zona);
  await guardarZonas(u, [...set]);
  el.checked = u.zonas.includes(zona);
}
// Desmarcar "Todas" no hace nada: para acotar se marcan zonas puntuales.
async function todasLasZonas(u, el) {
  if (el.checked) await guardarZonas(u, []);
  el.checked = !u.zonas.length;
}

onMounted(async () => {
  window.addEventListener('keydown', alTeclear);
  loading.value = true;
  try {
    const [data, zonas] = await Promise.all([getUsuarios(), getZonas()]);
    usuarios.value = data.map((u) => ({ ...u, roles: u.roles || [], zonas: u.zonas || [], _saving: false, _saved: false, _error: '' }));
    zonasDisp.value = zonas;
  } finally { loading.value = false; }
});
onBeforeUnmount(() => window.removeEventListener('keydown', alTeclear));
</script>

<style scoped>
/* Resumen de permisos en la tabla */
.resumen { display: flex; flex-wrap: wrap; gap: 4px; }
.resumen__chip { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; white-space: nowrap; background: #f3f4f6; color: #374151; }
.resumen__chip--sub { background: #fef3c7; color: #92400e; }
.resumen__chip--reportes { background: var(--accent-soft); color: #4f6f17; }
.resumen__chip--admin { background: #1f2937; color: #fff; }
.zonas-resumen { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6b7280; font-size: 13px; }
.acciones-usuario { white-space: nowrap; }
.acciones-usuario .btn { margin-left: 8px; }

/* Panel lateral de permisos */
.panel-overlay { position: fixed; inset: 0; z-index: 70; background: rgba(17, 24, 39, 0.35); }
.panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 71;
  width: 400px; max-width: 92vw; overflow-y: auto; padding: 20px 22px;
  background: #fff; box-shadow: -12px 0 32px rgba(0, 0, 0, 0.18);
  animation: panel-entrar 0.18s ease-out;
}
@keyframes panel-entrar { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.panel__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.panel__titulo { margin: 0; font-size: 18px; }
.panel__hint { margin: 4px 0 0; font-size: 13px; color: #6b7280; }
.panel__ok { color: #15803d; font-weight: 600; }
.panel__error { margin: 8px 0 0; }
.panel__cerrar { border: none; background: transparent; font-size: 18px; line-height: 1; cursor: pointer; color: #6b7280; padding: 6px 8px; border-radius: 6px; }
.panel__cerrar:hover { background: #f3f4f6; }
.panel__seccion { border-top: 1px solid var(--border); padding: 12px 0 6px; }
.panel__seccion-titulo { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
.perm { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 6px; font-size: 14px; cursor: pointer; }
.perm:hover { background: #f9fafb; }
.perm input { margin: 0; cursor: pointer; }
.perm--sub { padding-left: 26px; font-size: 13px; }
.perm--inactivo { color: #9ca3af; cursor: default; }
.perm--inactivo input { cursor: default; }
.perm-nota { margin: 0 0 4px 26px; font-size: 12px; color: #6b7280; }
.perm-nota--sin-sangria { margin-left: 4px; }
</style>
