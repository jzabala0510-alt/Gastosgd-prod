<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Bancos</h1>
        <p class="page__hint">Bancos disponibles para cargar saldos por tienda en el módulo de Saldos. Arrastra ⠿ para cambiar el orden en que aparecen. Desactivar un banco no borra su historial.</p>
      </div>
    </div>

    <div class="card filtros">
      <div class="field" style="flex:2">
        <label>Nuevo banco</label>
        <input v-model="nuevoNombre" placeholder="Nombre del banco…" @keyup.enter="agregar" :disabled="creando" />
      </div>
      <button class="btn btn--primary" :disabled="!nuevoNombre.trim() || creando" @click="agregar">Agregar</button>
    </div>

    <p v-if="loading" class="page__hint">Cargando bancos…</p>
    <template v-else>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th></th><th>Banco</th><th>Estado</th><th>Negativo</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(b, i) in bancos" :key="b.IdBanco"
              :class="{
                arrastrando: arrastrando === i,
                'drop-arriba': arrastrando !== null && sobre === i && i < arrastrando,
                'drop-abajo': arrastrando !== null && sobre === i && i > arrastrando,
              }"
              @dragover.prevent="sobre = i" @drop.prevent="soltar(i)">
            <td class="drag-handle" :draggable="editando === null && !guardandoOrden"
                title="Arrastra para cambiar el orden" @dragstart="iniciarArrastre(i, $event)" @dragend="terminarArrastre">⠿</td>
            <td>
              <input v-if="editando === b.IdBanco" v-model="edicion" class="banco-input"
                     @keyup.enter="guardarNombre(b)" @keyup.esc="editando = null" />
              <b v-else>{{ b.Nombre }}</b>
            </td>
            <td><span class="badge" :class="b.Activo ? 'badge--green' : 'badge--gray'">{{ b.Activo ? 'Activo' : 'Inactivo' }}</span></td>
            <td><span class="badge" :class="b.PermiteNegativo ? 'badge--amber' : 'badge--gray'">{{ b.PermiteNegativo ? 'Sí' : 'No' }}</span></td>
            <td class="acciones-inline">
              <template v-if="editando === b.IdBanco">
                <button class="btn btn--sm btn--primary" @click="guardarNombre(b)">Guardar</button>
                <button class="btn btn--sm" @click="editando = null">Cancelar</button>
              </template>
              <template v-else>
                <button class="btn btn--sm" @click="iniciarEdicion(b)">Renombrar</button>
                <button class="btn btn--sm" :class="b.Activo ? 'btn--warn' : 'btn--primary'" @click="toggleActivo(b)">
                  {{ b.Activo ? 'Desactivar' : 'Activar' }}
                </button>
                <button class="btn btn--sm" @click="toggleNegativo(b)">
                  {{ b.PermiteNegativo ? 'Quitar negativo' : 'Permitir negativo' }}
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table></div>
      <p v-if="!bancos.length" class="page__hint">Sin bancos registrados.</p>
    </template>

    <ModalFeedback :visible="modal.visible" :titulo="modal.titulo" :mensaje="modal.mensaje" :tipo="modal.tipo" @close="modal.visible = false" />
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import ModalFeedback from '../components/ModalFeedback.vue';
import { useConfirm } from '../composables/useConfirm';
import { getBancosAdmin, crearBanco, actualizarBanco, reordenarBancos } from '../api/bancos';

const { confirm } = useConfirm();
const bancos = ref([]);
const loading = ref(false);
const nuevoNombre = ref('');
const creando = ref(false);
const editando = ref(null);
const edicion = ref('');
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });
const arrastrando = ref(null); // índice de la fila que se está arrastrando
const sobre = ref(null);       // índice de la fila sobre la que va el arrastre
const guardandoOrden = ref(false);

function iniciarArrastre(i, e) {
  arrastrando.value = i;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(i)); // Firefox no inicia el arrastre sin datos
  const fila = e.target.closest('tr');
  if (fila) e.dataTransfer.setDragImage(fila, 20, fila.offsetHeight / 2);
}
function terminarArrastre() { arrastrando.value = null; sobre.value = null; }

// Mueve el banco en pantalla y guarda el orden completo; si falla, vuelve al del servidor.
async function soltar(destino) {
  const origen = arrastrando.value;
  terminarArrastre();
  if (origen === null || origen === destino) return;
  const lista = [...bancos.value];
  const [movido] = lista.splice(origen, 1);
  lista.splice(destino, 0, movido);
  bancos.value = lista;
  guardandoOrden.value = true;
  try {
    await reordenarBancos(lista.map((b) => b.IdBanco));
  } catch (e) {
    error(e, 'No se pudo guardar el orden.');
    await cargar();
  } finally { guardandoOrden.value = false; }
}

function error(e, fallback) {
  modal.value = { visible: true, titulo: 'Error', mensaje: e.response?.data?.error || fallback, tipo: 'error' };
}

async function cargar() {
  loading.value = true;
  try { bancos.value = await getBancosAdmin(); } finally { loading.value = false; }
}

async function agregar() {
  const nombre = nuevoNombre.value.trim();
  if (!nombre) return;
  creando.value = true;
  try {
    await crearBanco(nombre);
    nuevoNombre.value = '';
    await cargar();
  } catch (e) { error(e, 'No se pudo crear el banco.'); }
  finally { creando.value = false; }
}

function iniciarEdicion(b) { editando.value = b.IdBanco; edicion.value = b.Nombre; }

async function guardarNombre(b) {
  const nombre = edicion.value.trim();
  if (!nombre) return;
  try {
    await actualizarBanco(b.IdBanco, { nombre });
    editando.value = null;
    await cargar();
  } catch (e) { error(e, 'No se pudo renombrar el banco.'); }
}

async function toggleActivo(b) {
  if (b.Activo) {
    const conf = await confirm({
      titulo: 'Desactivar banco',
      mensaje: `"${b.Nombre}" dejará de aparecer en Carga de Saldos. El historial ya cargado no se pierde.`,
      tipo: 'warn', labelConfirmar: 'Desactivar',
    });
    if (!conf.ok) return;
  }
  try {
    await actualizarBanco(b.IdBanco, { activo: !b.Activo });
    await cargar();
  } catch (e) { error(e, 'No se pudo actualizar el banco.'); }
}

// A diferencia de desactivar, esto no esconde nada ni borra historial — no hace
// falta modal de confirmación, es un simple metadato de cómo se valida el input.
async function toggleNegativo(b) {
  try {
    await actualizarBanco(b.IdBanco, { permiteNegativo: !b.PermiteNegativo });
    await cargar();
  } catch (e) { error(e, 'No se pudo actualizar el banco.'); }
}

onMounted(cargar);
</script>

<style scoped>
.banco-input { width: 100%; max-width: 280px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px; font-size: 14px; outline: none; }
.banco-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.drag-handle { width: 28px; text-align: center; font-size: 16px; color: var(--muted); cursor: grab; user-select: none; }
.drag-handle:active { cursor: grabbing; }
tr.arrastrando td { opacity: .45; }
tr.drop-arriba td { box-shadow: inset 0 2px 0 var(--accent); }
tr.drop-abajo td { box-shadow: inset 0 -2px 0 var(--accent); }
</style>
