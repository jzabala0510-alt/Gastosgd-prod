<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Bancos</h1>
        <p class="page__hint">Bancos disponibles para cargar saldos por tienda en el módulo de Saldos. Desactivar un banco no borra su historial.</p>
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
        <thead><tr><th>Banco</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="b in bancos" :key="b.IdBanco">
            <td>
              <input v-if="editando === b.IdBanco" v-model="edicion" class="banco-input"
                     @keyup.enter="guardarNombre(b)" @keyup.esc="editando = null" />
              <b v-else>{{ b.Nombre }}</b>
            </td>
            <td><span class="badge" :class="b.Activo ? 'badge--green' : 'badge--gray'">{{ b.Activo ? 'Activo' : 'Inactivo' }}</span></td>
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
import { getBancosAdmin, crearBanco, actualizarBanco } from '../api/bancos';

const { confirm } = useConfirm();
const bancos = ref([]);
const loading = ref(false);
const nuevoNombre = ref('');
const creando = ref(false);
const editando = ref(null);
const edicion = ref('');
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });

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

onMounted(cargar);
</script>

<style scoped>
.banco-input { width: 100%; max-width: 280px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 7px; font-size: 14px; outline: none; }
.banco-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
</style>
