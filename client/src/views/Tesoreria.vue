<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Bandeja de Tesorería</h1>
        <p class="page__hint">Solo aparecen las facturas aprobadas por el analista. El monto disponible se precarga desde Saldos; puedes corregirlo aquí si hace falta.</p>
      </div>
    </div>

    <div class="card">
      <SelectorZMT :store="store" @buscar="onTienda" />
      <div v-if="store.codTienda && !aviso" class="fondos" style="margin-top:16px">
        <div class="field">
          <label>Monto disponible hoy (Bs)</label>
          <InputMonto v-model="monto" />
        </div>
        <div class="field">
          <label>Préstamo / ajuste (Bs)</label>
          <InputMonto v-model="prestamo" placeholder="0" permitir-negativo />
        </div>
        <button class="btn btn--primary" @click="guardar" :disabled="busy">Guardar fondos</button>
      </div>
      <div v-if="cob" class="fondos__resumen">
        <span>Disponible{{ !store.codTienda ? ' total' : '' }}: <b>{{ money(cob.disponible) }} Bs</b></span>
        <template v-if="prestamo !== 0">
          <span>Préstamo: <b :class="prestamo < 0 ? 'txt--danger' : 'txt--accent'">{{ prestamo > 0 ? '+' : '' }}{{ money(prestamo) }} Bs</b></span>
          <span>Total efectivo: <b>{{ money(efectivo) }} Bs</b></span>
        </template>
        <span>Pendiente total: <b>{{ money(cob.totalPendiente) }} Bs</b></span>
        <span class="badge" :class="cubre ? 'badge--green' : 'badge--amber'">{{ cubre ? 'El disponible cubre todo' : 'El disponible no cubre todo' }}</span>
      </div>
    </div>

    <div v-if="pendientes.length" class="card colapsable-card">
      <button class="colapsable-toggle" @click="pendientesAbiertos = !pendientesAbiertos">
        <span class="colapsable-toggle__text">
          <span class="badge badge--amber">{{ pendientes.length }}</span>
          Tiendas con pendientes
        </span>
        <span class="colapsable-toggle__arrow" :class="{ open: pendientesAbiertos }">›</span>
      </button>
      <ul v-if="pendientesAbiertos" class="pend-lista colapsable-lista">
        <li v-for="it in pendientes" :key="it.codTienda" class="pend-row" @click="saltarA(it)">
          <span class="pend-row__lugar"><b>{{ it.tienda }}</b> · {{ it.zona }} · {{ it.marca }}</span>
          <span class="badge badge--amber">{{ it.n }}</span>
          <span class="zona-row__arrow">›</span>
        </li>
      </ul>
    </div>

    <template v-if="cob && cob.gastos.length">
      <div class="card filtros">
        <div class="field" :class="{ 'field--active': store.filtros.desde }"><label>Desde</label><input type="date" v-model="store.filtros.desde" /></div>
        <div class="field" :class="{ 'field--active': store.filtros.hasta }"><label>Hasta</label><input type="date" v-model="store.filtros.hasta" /></div>
        <div class="field" :class="{ 'field--active': store.filtros.proveedor }"><label>Proveedor</label><input v-model="store.filtros.proveedor" placeholder="Nombre…" /></div>
        <div class="field" :class="{ 'field--active': store.filtros.tipoGasto }">
          <label>Tipo de gasto</label>
          <select v-model="store.filtros.tipoGasto">
            <option value="">Todos</option>
            <option v-for="t in tiposGasto" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <button class="btn btn--sm" @click="store.limpiarFiltros()">Limpiar</button>
      </div>

      <div class="seleccion-bar">
        <span>Seleccionadas: <b>{{ selCount }}</b></span>
        <span>Monto seleccionado: <b>{{ money(selMonto) }} Bs</b></span>
        <span class="badge" :class="selExcede ? 'badge--red' : 'badge--green'">{{ selExcede ? 'Excede el disponible' : 'Dentro del disponible' }}</span>
        <button class="btn btn--primary btn--sm" :disabled="busy || !selCount" @click="aprobarSeleccionadas">
          Aprobar seleccionadas ({{ selCount }})
        </button>
      </div>

      <div class="table-wrap"><table class="grid">
        <thead>
          <tr>
            <th><input type="checkbox" :checked="todasMarcadas" @change="toggleTodas($event)" /></th>
            <th v-if="!store.codTienda">Tienda</th>
            <th>Factura</th><th>Fecha</th><th>Proveedor</th><th>Tipo de gasto</th><th class="r">Pendiente (Bs)</th><th class="r">Acumulado (Bs)</th>
            <th>Cobertura</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in filtradas" :key="keyOf(g)" :class="{ sel: sel[keyOf(g)] }">
            <td><input type="checkbox" v-model="sel[keyOf(g)]" /></td>
            <td v-if="!store.codTienda">{{ g._tiendaNombre }}</td>
            <td><code>{{ g.NumSerie }}-{{ g.NumFactura }}</code></td>
            <td>{{ fecha(g.FechaGasto) }}</td>
            <td>{{ g.Proveedor || '—' }}</td>
            <td>{{ g.TipoGasto || '—' }}</td>
            <td class="r">{{ money(g.Monto) }}</td>
            <td class="r">{{ money(g.Acumulado) }}</td>
            <td><span class="badge" :class="g.Cubierto ? 'badge--green' : 'badge--red'">{{ g.Cubierto ? 'Cubierto' : 'Excede' }}</span></td>
            <td class="acciones-inline">
              <router-link class="btn btn--sm" :to="`/factura/${g.CodTienda || store.codTienda}/${enc(g.NumSerie)}/${g.NumFactura}/${enc(g.N)}`">Detalle</router-link>
              <button class="btn btn--warn btn--sm" :disabled="busy" @click="dec(g, 'DEVUELTO')">Devolver</button>
              <button class="btn btn--danger btn--sm" :disabled="busy" @click="dec(g, 'RECHAZADO')">Rechazar</button>
            </td>
          </tr>
        </tbody>
      </table></div>
    </template>
    <p v-else-if="loading" class="page__hint">Cargando…</p>
    <div v-else-if="aviso" class="empty card">{{ aviso }}</div>
    <p v-else-if="store.zona" class="page__hint">Sin facturas aprobadas por el analista para la selección actual.</p>

    <ModalFeedback :visible="modal.visible" :titulo="modal.titulo" :mensaje="modal.mensaje" :tipo="modal.tipo" @close="onModalClose" />
  </section>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import SelectorZMT from '../components/SelectorZMT.vue';
import ModalFeedback from '../components/ModalFeedback.vue';
import InputMonto from '../components/InputMonto.vue';
import { useTesoreriaStore } from '../stores/vistas';
import { useNotifStore } from '../stores/notificaciones';
import { useConfirm } from '../composables/useConfirm';
import { getCobertura, setDisponibilidad, accionTesoreria } from '../api/facturas';
import { money, fecha, hoyVE } from '../utils/format';

const store = useTesoreriaStore();
const notif = useNotifStore();
const { confirm } = useConfirm();
const enc = encodeURIComponent;

const pendientes = computed(() => notif.detalle.tesoreria);
const pendientesAbiertos = ref(false);
function saltarA(it) {
  store.$patch({ zona: it.zona, marca: it.marca, codTienda: it.codTienda, autobuscar: true });
}
const monto = ref(0);
const prestamo = ref(0);
const cob = ref(null);
const busy = ref(false);
const loading = ref(false);
const aviso = ref('');
const hoy = hoyVE();
const sel = reactive({});
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });

// Incluye CodTienda en la clave para evitar colisiones al combinar múltiples tiendas.
const keyOf = (g) => `${g.CodTienda || store.codTienda}-${g.NumSerie}-${g.NumFactura}-${g.N}`;
// Disponible real = monto registrado + préstamo/ajuste manual (puede ser negativo).
const efectivo = computed(() => (cob.value?.disponible || 0) + (prestamo.value || 0));
const cubre = computed(() => cob.value && cob.value.totalPendiente <= efectivo.value);
const tiposGasto = computed(() => {
  if (!cob.value) return [];
  return [...new Set(cob.value.gastos.map((g) => g.TipoGasto || 'SIN ESPECIFICAR'))].sort();
});

const filtradas = computed(() => {
  if (!cob.value) return [];
  const ff = store.filtros;
  return cob.value.gastos.filter((g) => {
    const d = (g.FechaGasto || '').slice(0, 10);
    if (ff.desde && d < ff.desde) return false;
    if (ff.hasta && d > ff.hasta) return false;
    if (ff.proveedor && !(g.Proveedor || '').toLowerCase().includes(ff.proveedor.toLowerCase())) return false;
    if (ff.tipoGasto && (g.TipoGasto || 'SIN ESPECIFICAR') !== ff.tipoGasto) return false;
    return true;
  });
});

const seleccionadas = computed(() => filtradas.value.filter((g) => sel[keyOf(g)]));
const selCount = computed(() => seleccionadas.value.length);
const selMonto = computed(() => seleccionadas.value.reduce((a, g) => a + (Number(g.Monto) || 0), 0));
const selExcede = computed(() => cob.value && selMonto.value > efectivo.value);
const todasMarcadas = computed(() => filtradas.value.length > 0 && filtradas.value.every((g) => sel[keyOf(g)]));

function toggleTodas(e) {
  const v = e.target.checked;
  filtradas.value.forEach((g) => { sel[keyOf(g)] = v; });
}

async function onTienda(cod) {
  cob.value = null; aviso.value = ''; prestamo.value = 0;
  if (!cod && !store.tiendas.length) return;
  await load();
}

async function load() {
  loading.value = true;
  try {
    if (store.codTienda) {
      // Tienda específica — comportamiento original
      const r = await getCobertura(store.codTienda, hoy);
      if (r.disponibleLocal === false) { aviso.value = r.aviso; cob.value = null; }
      else {
        cob.value = { ...r, gastos: r.gastos.map((g) => ({ ...g, CodTienda: store.codTienda, Marca: r.tienda?.Marca || '' })) };
        monto.value = r.disponible ?? 0;
        Object.keys(sel).forEach((k) => delete sel[k]);
        r.gastos.forEach((g) => { sel[keyOf({ ...g, CodTienda: store.codTienda })] = !!g.Cubierto; });
      }
    } else {
      // Todas las tiendas del scope — llamadas en paralelo, disponibles sumados
      const scopeTiendas = store.tiendas;
      const results = await Promise.all(scopeTiendas.map((t) => getCobertura(t.CodTienda, hoy).catch(() => null)));
      const allGastos = [];
      let totalDisp = 0, totalPend = 0;

      for (const [i, r] of results.entries()) {
        if (!r) continue;
        // Siempre sumar el disponible (viene de la BD propia aunque la BD de marca falle)
        totalDisp += r.disponible || 0;
        if (r.disponibleLocal === false) continue;  // sin gastos si no se pudo leer la marca
        totalPend += r.totalPendiente || 0;
        const t = scopeTiendas[i];
        allGastos.push(...r.gastos.map((g) => ({
          ...g,
          CodTienda: t.CodTienda,
          Marca: r.tienda?.Marca || t.Marca || '',
          _tiendaNombre: r.tienda?.Nombre || t.Tienda || '',
        })));
      }

      if (!allGastos.length && totalDisp === 0) {
        aviso.value = 'Sin facturas pendientes de Tesorería para la selección actual.';
        return;
      }

      // Recalcular Acumulado y Cubierto sobre el disponible global sumado
      let acum = 0;
      for (const g of allGastos) {
        acum += Number(g.Monto) || 0;
        g.Acumulado = acum;
        g.Cubierto = acum <= totalDisp;
      }

      cob.value = { disponible: totalDisp, totalPendiente: totalPend, gastos: allGastos, tienda: null };
      monto.value = totalDisp;
      Object.keys(sel).forEach((k) => delete sel[k]);
      allGastos.forEach((g) => { sel[keyOf(g)] = !!g.Cubierto; });
    }
  } finally { loading.value = false; }
}

async function guardar() {
  if (!store.codTienda) return;
  busy.value = true;
  try {
    await setDisponibilidad({ codTienda: store.codTienda, fecha: hoy, montoDisponible: monto.value });
    await load();
  } finally { busy.value = false; }
}

async function aprobarSeleccionadas() {
  const elegidas = seleccionadas.value.slice();
  if (!elegidas.length) return;
  const n = elegidas.length;
  const conf = await confirm({
    titulo: 'Aprobar facturas',
    mensaje: selExcede.value
      ? `El monto seleccionado excede el disponible. ¿Aprobar ${n} factura${n > 1 ? 's' : ''} de todos modos?`
      : `¿Confirmas aprobar ${n} factura${n > 1 ? 's' : ''} y enviarla${n > 1 ? 's' : ''} a Auditoría?`,
    tipo: selExcede.value ? 'danger' : 'info',
    labelConfirmar: 'Aprobar',
  });
  if (!conf.ok) return;
  busy.value = true;
  try {
    for (const g of elegidas) {
      await accionTesoreria({
        codTienda: g.CodTienda || store.codTienda,
        numserie: g.NumSerie, numfactura: g.NumFactura, n: g.N,
        marca: g.Marca || '',
        decision: 'APROBADO', comentario: 'Aprobada para pago',
      });
    }
    const n = elegidas.length;
    modal.value = { visible: true, titulo: 'Aprobadas', mensaje: `${n} factura${n > 1 ? 's' : ''} enviada${n > 1 ? 's' : ''} a Auditoría.`, tipo: 'success' };
  } finally { busy.value = false; }
}

async function pedirConfirmacion(decision) {
  if (decision === 'DEVUELTO') {
    return confirm({ titulo: 'Devolver factura', mensaje: 'La factura volverá al Analista para su corrección.', tipo: 'warn', pedirComentario: true, comentarioRequerido: true, placeholder: 'Motivo de la devolución…', labelConfirmar: 'Devolver' });
  }
  return confirm({ titulo: 'Rechazar factura', mensaje: 'Esta acción rechaza la factura.', tipo: 'danger', pedirComentario: true, comentarioRequerido: true, placeholder: 'Motivo del rechazo…', labelConfirmar: 'Rechazar' });
}

async function dec(g, decision) {
  const conf = await pedirConfirmacion(decision);
  if (!conf.ok) return;
  busy.value = true;
  try {
    await accionTesoreria({
      codTienda: g.CodTienda || store.codTienda,
      numserie: g.NumSerie, numfactura: g.NumFactura, n: g.N,
      marca: g.Marca || '',
      decision, comentario: conf.comentario,
    });
    if (decision === 'DEVUELTO') modal.value = { visible: true, titulo: 'Devuelta', mensaje: 'Factura devuelta al Analista.', tipo: 'warn' };
    else modal.value = { visible: true, titulo: 'Rechazada', mensaje: 'Factura rechazada.', tipo: 'error' };
  } finally { busy.value = false; }
}

function onModalClose() { modal.value.visible = false; load(); }
</script>
