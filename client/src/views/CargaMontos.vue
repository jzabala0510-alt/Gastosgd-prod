<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Carga de Saldos</h1>
        <p v-if="moneda === 'BS'" class="page__hint">Selecciona zona, tienda y fecha, y carga el saldo disponible (Bs) por tienda y banco. Alimenta la cobertura de Tesorería.</p>
        <p v-else class="page__hint">Saldo en dólares por tienda y banco. Es informativo: no entra en la cobertura de Tesorería ni en el reporte de saldos, que son en Bs.</p>
      </div>
      <router-link v-if="auth.esAdmin" to="/fondos/banesco/consola" class="btn btn--sm">Consola Banesco</router-link>
    </div>

    <div class="tabs-bar">
      <button :class="['tab-btn', moneda === 'BS' && 'tab-btn--active']" @click="cambiarMoneda('BS')">Bolívares (Bs)</button>
      <button :class="['tab-btn', moneda === 'USD' && 'tab-btn--active']" @click="cambiarMoneda('USD')">Dólares ($)</button>
    </div>

    <div class="card filtros">
      <div class="field" :class="{ 'field--active': zona }">
        <label>Zona</label>
        <select v-model="zona" @change="onZona">
          <option value="">Selecciona zona…</option>
          <option v-for="z in zonas" :key="z.Zona" :value="z.Zona">{{ z.Zona }} ({{ z.Tiendas }})</option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': filtroTienda }">
        <label>Tienda</label>
        <select v-model="filtroTienda" :disabled="!zona">
          <option value="">Todas las de la zona</option>
          <option v-for="t in tiendas" :key="t.codTienda" :value="t.codTienda">{{ t.tienda }}</option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': fecha }">
        <label>Fecha</label>
        <input type="date" v-model="fecha" @change="onFecha" />
      </div>
    </div>

    <p v-if="loading" class="page__hint">Cargando tiendas…</p>
    <div v-else-if="zona && !bancos.length" class="empty card">
      No hay bancos configurados. Pide a un administrador que los agregue en <b>Admin → Bancos</b>.
    </div>
    <template v-else-if="zona && visibles.length">
      <div class="seleccion-bar">
        <span>Tiendas: <b>{{ visibles.length }}</b></span>
        <span class="leyenda-cargada"><i></i> Con saldo cargado: <b>{{ visibles.filter((t) => cargadas.has(t.codTienda)).length }}</b> de {{ visibles.length }}</span>
        <span>Total saldo: <b>{{ conSimbolo(totalSaldo) }}</b></span>
        <div class="seleccion-bar__acciones">
          <button v-if="banescoTiendas.length && esHoy && (moneda === 'BS' || banescoUsd)" type="button" class="btn-banesco" :class="{ 'btn-banesco--cargando': banescoBusy }"
                  :disabled="busy || banescoBusy" @click="actualizarBanesco"
                  :title="`Trae de Banesco el saldo en ${simbolo} de este momento de ${banescoTiendas.length} tienda(s) de la zona`">
            <span v-if="banescoBusy" class="btn-banesco__spinner" aria-hidden="true"></span>
            <span v-else class="btn-banesco__icono" aria-hidden="true">🏦</span>
            {{ banescoBusy ? 'Consultando Banesco…' : (banescoAmbas ? 'Actualizar Banesco (Bs y $)' : 'Actualizar Banesco') }}
            <span v-if="!banescoBusy" class="btn-banesco__cuenta">{{ banescoTiendas.length }}</span>
          </button>
          <button class="btn btn--primary btn--sm" :disabled="busy || banescoBusy" @click="guardar">Guardar</button>
        </div>
      </div>
      <div v-if="banescoBusy" class="cargando banesco-cargando">
        <span class="spinner"></span>
        <div class="cargando__text">
          <b>Consultando saldos en {{ simbolo }} en Banesco…</b>
          <span>Se consultan {{ banescoTiendas.length }} tienda(s), una por una. Puede tardar unos segundos.</span>
        </div>
      </div>
      <div v-if="banescoResultado && banescoResultado.ok.length" class="banesco-ok">
        ✓ Banesco: {{ banescoResultado.ok.length }} tienda(s) actualizada(s) con el saldo {{ (banescoResultado.monedas || []).length > 1 ? 'en Bs y $' : `en ${simbolo}` }} de este momento.
      </div>
      <div v-if="banescoAviso" :class="banescoAviso.espera ? 'banesco-espera' : 'soporte-aviso'">
        {{ banescoAviso.espera ? '⏳' : '⚠' }} {{ banescoAviso.texto }}
      </div>
      <div v-if="banescoResultado && banescoResultado.errores.length" class="soporte-aviso">
        ⚠ No se pudo actualizar Banesco en:
        <ul class="banesco-errores">
          <li v-for="(e, i) in banescoResultado.errores" :key="i"><b>{{ nombreTienda(e.codTienda) || e.empresa }}</b>: {{ e.motivo }}</li>
        </ul>
      </div>
      <div class="table-wrap" :class="{ 'tabla-actualizando': banescoBusy }"><table class="grid">
        <thead>
          <tr>
            <th>Tienda</th><th>Marca</th>
            <th v-for="b in bancos" :key="b.IdBanco" class="r">{{ b.Nombre }}</th>
            <th class="r">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in visibles" :key="t.codTienda" :class="{ 'fila-cargada': cargadas.has(t.codTienda) }">
            <td><b>{{ t.tienda }}</b></td>
            <td>{{ t.marca || '—' }}</td>
            <td v-for="b in bancos" :key="b.IdBanco" class="r" :class="{ 'celda-banesco': resaltadas.has(`${t.codTienda}|${b.IdBanco}`) }">
              <span v-if="moneda === 'USD'" class="monto-usd">
                <span class="monto-usd__signo" aria-hidden="true">$</span>
                <InputMonto class="monto-input" v-model="montos[t.codTienda][b.IdBanco]" :permitir-negativo="b.PermiteNegativo" />
              </span>
              <InputMonto v-else class="monto-input" v-model="montos[t.codTienda][b.IdBanco]" :permitir-negativo="b.PermiteNegativo" />
            </td>
            <td class="r"><b>{{ conSimbolo(totalTienda(t)) }}</b></td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="fila-totales">
            <td colspan="2">Total por banco<span v-if="filtroTienda"> (tienda filtrada)</span></td>
            <td v-for="b in bancos" :key="b.IdBanco" class="r">{{ money(totalesPorBanco[b.IdBanco]) }}</td>
            <td class="r">{{ conSimbolo(totalSaldo) }}</td>
          </tr>
        </tfoot>
      </table></div>
      <div style="margin-top:14px">
        <button class="btn btn--primary" :disabled="busy || banescoBusy" @click="guardar">Guardar saldos en {{ simbolo }} del {{ fechaLabel }}</button>
      </div>
    </template>
    <div v-else-if="zona" class="empty card">No hay tiendas para mostrar.</div>
    <p v-else class="page__hint">Elige una zona arriba.</p>

    <ModalFeedback :visible="modal.visible" :titulo="modal.titulo" :mensaje="modal.mensaje" :tipo="modal.tipo" @close="modal.visible = false" />
  </section>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import ModalFeedback from '../components/ModalFeedback.vue';
import InputMonto from '../components/InputMonto.vue';
import { getZonas } from '../api/facturas';
import { getFondosZona, guardarFondos, getBanescoEstado, sincronizarBanesco } from '../api/fondos';
import { getBancos } from '../api/bancos';
import { money, hoyVE } from '../utils/format';
import { useAvisoSalida } from '../composables/useAvisoSalida';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

const zonas = ref([]);
const zona = ref('');
const filtroTienda = ref('');
const fecha = ref(hoyVE());
const moneda = ref('BS'); // pestaña: 'BS' o 'USD' — mismos bancos, otra moneda del saldo
const simbolo = computed(() => (moneda.value === 'USD' ? '$' : 'Bs'));
const conSimbolo = (v) => (moneda.value === 'USD' ? `$ ${money(v)}` : `${money(v)} Bs`);
const tiendas = ref([]);
const bancos = ref([]);
const montos = ref({});   // montos[codTienda][idBanco] = valor del input
const loading = ref(false);
const busy = ref(false);
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });
const banescoTiendas = ref([]);     // codTienda de la zona con credencial Banesco (banesco.json)
const banescoUsd = ref(false);      // saldo en $ de Banesco configurado (bancoUsd en banesco.json)
const banescoAmbas = ref(false);    // una sola consulta trae Bs y $ (modelo de posición): el botón graba las dos
const banescoBusy = ref(false);
const banescoResultado = ref(null); // { ok, errores } de la última actualización
// Aviso de la petición en sí (no de una tienda): espera entre consultas, otra en curso,
// zona fuera de alcance o falla general. { texto, espera: true si solo hay que esperar }.
const banescoAviso = ref(null);
const resaltadas = ref(new Set());  // `${codTienda}|${idBanco}` recién traídos de Banesco: se iluminan un momento
const cargadas = ref(new Set());    // codTienda con saldo guardado en esa fecha y moneda: su fila se tiñe
let timerResaltado = null;
// El API de Banesco da el saldo de este momento: solo tiene sentido para hoy.
const esHoy = computed(() => fecha.value === hoyVE());

// Sucio = hay montos escritos por el usuario que no se han guardado todavía.
const sucio = ref(false);
watch(montos, () => { sucio.value = true; }, { deep: true });
useAvisoSalida(sucio);

const visibles = computed(() => (filtroTienda.value
  ? tiendas.value.filter((t) => Number(t.codTienda) === Number(filtroTienda.value))
  : tiendas.value));

const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);
const totalTienda = (t) => bancos.value.reduce((a, b) => a + num(montos.value[t.codTienda]?.[b.IdBanco]), 0);
const totalSaldo = computed(() => visibles.value.reduce((a, t) => a + totalTienda(t), 0));
// Total de cada banco (columna) sobre las tiendas visibles; se actualiza mientras escriben.
const totalesPorBanco = computed(() => Object.fromEntries(bancos.value.map((b) => [
  b.IdBanco, visibles.value.reduce((a, t) => a + num(montos.value[t.codTienda]?.[b.IdBanco]), 0),
])));
const fechaLabel = computed(() => fecha.value.split('-').reverse().join('/'));

async function onZona() {
  filtroTienda.value = '';
  banescoResultado.value = null;
  banescoAviso.value = null;
  banescoTiendas.value = [];
  await cargar();
  if (!zona.value) return;
  try {
    const est = await getBanescoEstado(zona.value);
    banescoTiendas.value = est.tiendas || [];
    banescoUsd.value = !!est.usd;
    banescoAmbas.value = !!est.ambas;
  } catch { banescoTiendas.value = []; }
}
async function cambiarMoneda(m) {
  if (m === moneda.value) return;
  if (sucio.value) {
    modal.value = { visible: true, titulo: 'Cambios sin guardar', mensaje: `Guarda los saldos en ${simbolo.value} que escribiste antes de cambiar de pestaña.`, tipo: 'warn' };
    return;
  }
  moneda.value = m;
  banescoResultado.value = null;
  banescoAviso.value = null;
  await cargar();
}
async function onFecha() {
  banescoResultado.value = null;
  banescoAviso.value = null;
  await cargar();
}

const nombreTienda = (cod) => tiendas.value.find((t) => Number(t.codTienda) === Number(cod))?.tienda;

async function actualizarBanesco() {
  if (sucio.value) {
    modal.value = { visible: true, titulo: 'Cambios sin guardar', mensaje: 'Guarda los saldos que escribiste antes de actualizar Banesco: la tabla se recarga.', tipo: 'warn' };
    return;
  }
  const z = zona.value;
  banescoBusy.value = true;
  banescoResultado.value = null;
  banescoAviso.value = null;
  try {
    const m = moneda.value;
    const r = await sincronizarBanesco(z, m);
    if (zona.value !== z || moneda.value !== m) return; // cambiaron de zona o de pestaña mientras consultaba
    banescoResultado.value = r;
    await cargar();
    resaltadas.value = new Set(r.ok.flatMap((x) => (x.saldos || []).map((s) => `${x.codTienda}|${s.idBanco}`)));
    clearTimeout(timerResaltado);
    timerResaltado = setTimeout(() => { resaltadas.value = new Set(); }, 2600);
  } catch (e) {
    if (zona.value === z) {
      const espera = [409, 429].includes(e.response?.status);
      banescoAviso.value = { espera, texto: e.response?.data?.error || `No se pudo consultar Banesco: ${e.message}` };
    }
  } finally { banescoBusy.value = false; }
}
async function cargar() {
  tiendas.value = []; montos.value = {}; cargadas.value = new Set();
  await nextTick();
  sucio.value = false; // limpiar la tabla tampoco cuenta como cambio sin guardar
  if (!zona.value || !fecha.value) return;
  loading.value = true;
  try {
    const data = await getFondosZona(zona.value, fecha.value, moneda.value);
    tiendas.value = data;
    cargadas.value = new Set(data.filter((t) => Object.keys(t.bancos || {}).length).map((t) => t.codTienda));
    const m = {};
    data.forEach((t) => {
      m[t.codTienda] = {};
      bancos.value.forEach((b) => {
        const v = t.bancos?.[b.IdBanco];
        m[t.codTienda][b.IdBanco] = v != null ? Number(v) : '';
      });
    });
    montos.value = m;
    await nextTick();
    sucio.value = false; // la carga inicial no cuenta como cambio sin guardar
  } finally { loading.value = false; }
}

async function guardar() {
  const items = [];
  visibles.value.forEach((t) => {
    bancos.value.forEach((b) => {
      const v = montos.value[t.codTienda]?.[b.IdBanco];
      if (v !== '' && v != null && Number.isFinite(Number(v))) {
        items.push({ codTienda: t.codTienda, idBanco: b.IdBanco, monto: Number(v) });
      }
    });
  });
  if (!items.length) {
    modal.value = { visible: true, titulo: 'Nada que guardar', mensaje: 'Ingresa al menos un saldo.', tipo: 'warn' };
    return;
  }
  busy.value = true;
  try {
    const r = await guardarFondos({ fecha: fecha.value, items, moneda: moneda.value });
    sucio.value = false;
    cargadas.value = new Set([...cargadas.value, ...items.map((i) => i.codTienda)]);
    modal.value = { visible: true, titulo: 'Saldos guardados', mensaje: `Se guardaron ${r.guardadas} registro(s) en ${simbolo.value} para el ${fechaLabel.value}.`, tipo: 'success' };
  } catch (e) {
    modal.value = { visible: true, titulo: 'Error', mensaje: e.response?.data?.error || 'No se pudo guardar.', tipo: 'error' };
  } finally { busy.value = false; }
}

onMounted(async () => {
  [zonas.value, bancos.value] = await Promise.all([getZonas(), getBancos()]);
});
</script>

<style scoped>
/* Pestañas Bs / $ — mismo estilo que Auditoría */
.tabs-bar { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--border); }
.tab-btn {
  padding: 8px 18px; background: none; border: none; border-bottom: 3px solid transparent; margin-bottom: -2px;
  font-size: 0.9rem; color: var(--text-muted); cursor: pointer; transition: color 0.15s, border-color 0.15s;
}
.tab-btn:hover { color: var(--text); }
.tab-btn--active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.monto-input { width: 110px; padding: 7px 8px; border: 1px solid var(--border); border-radius: 7px; font-size: 13px; text-align: right; outline: none; }
.monto-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

/* Pestaña $: signo dentro del campo */
.monto-usd { position: relative; display: inline-block; }
.monto-usd__signo { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); font-size: 13px; color: #6b7280; pointer-events: none; }
.monto-usd .monto-input { padding-left: 20px; }

/* Totales por banco: fila fija al pie de la tabla (se ve aunque se baje por las tiendas) */
.fila-totales td {
  position: sticky; bottom: 0; z-index: 1;
  background: #f3f4f6; border-top: 2px solid var(--border); font-weight: 700;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* Tiendas que ya tienen saldo guardado en esa fecha y moneda */
.fila-cargada td { background: #f0fdf4; }
.fila-cargada td:first-child { box-shadow: inset 3px 0 0 #22c55e; }
.leyenda-cargada { display: inline-flex; align-items: center; gap: 6px; }
.leyenda-cargada i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: #f0fdf4; border: 1px solid #86efac; box-shadow: inset 3px 0 0 #22c55e; }
.banesco-errores { margin: 6px 0 0; padding-left: 20px; }
.banesco-errores li { overflow-wrap: anywhere; }

/* Botón "Actualizar Banesco" y su animación de carga */
.seleccion-bar__acciones { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.btn-banesco {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 8px 7px 14px; border: none; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 600; color: #fff;
  background: linear-gradient(135deg, #00a651, #00783b);
  box-shadow: 0 2px 6px rgba(0, 120, 59, 0.35);
  transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
}
.btn-banesco:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(0, 120, 59, 0.4); filter: brightness(1.06); }
.btn-banesco:active:not(:disabled) { transform: translateY(0); box-shadow: 0 2px 6px rgba(0, 120, 59, 0.35); }
.btn-banesco:disabled { cursor: default; opacity: 0.6; }
.btn-banesco--cargando:disabled { opacity: 1; padding-right: 14px; }
.btn-banesco__icono { font-size: 15px; line-height: 1; }
.btn-banesco__cuenta { min-width: 22px; padding: 2px 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.25); font-size: 12px; text-align: center; }
.btn-banesco__spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35); border-top-color: #fff;
  animation: banesco-giro 0.8s linear infinite;
}
@keyframes banesco-giro { to { transform: rotate(360deg); } }

.banesco-cargando { margin-bottom: 16px; padding: 16px 20px; }
.banesco-espera {
  margin-bottom: 14px; padding: 10px 14px; border-radius: 7px; font-size: 14px;
  background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a;
}
.banesco-ok {
  margin-bottom: 14px; padding: 10px 14px; border-radius: 7px; font-size: 14px;
  background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46;
}
.tabla-actualizando { opacity: 0.5; pointer-events: none; transition: opacity 0.2s; }
.celda-banesco { animation: banesco-celda 2.4s ease-out; }
.celda-banesco .monto-input { animation: banesco-monto 2.4s ease-out; }
@keyframes banesco-celda {
  0%, 25% { background: #dcfce7; }
  100% { background: transparent; }
}
@keyframes banesco-monto {
  0%, 25% { background: #bbf7d0; border-color: #22c55e; font-weight: 700; }
  100% { background: #fff; border-color: var(--border); }
}
</style>
