<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Seguimiento ICG</h1>
        <p class="page__hint">
          Lo que el sistema detecta comparando la app con ICG: gastos que ICG reabrió después de saldarlos y gastos de
          mayores (TOP GROUP / MAYORES) transferidos a una tienda. En <b>simulación</b> solo se listan; no se cambia nada.
        </p>
      </div>
      <button class="btn btn--sm" :disabled="cargando" @click="cargar">Actualizar</button>
    </div>

    <p v-if="error" class="soporte-aviso">⚠ {{ error }}</p>
    <p v-if="cargando && !d" class="page__hint">Cargando…</p>

    <template v-if="d">
      <div class="card seg__modos">
        <div v-for="m in modos" :key="m.clave" class="seg__modo">
          <span class="badge" :class="m.aplicar ? 'badge--green' : 'badge--amber'">{{ m.aplicar ? 'Aplicando' : 'Simulación' }}</span>
          <div>
            <b>{{ m.titulo }}</b>
            <small>{{ m.aplicar ? m.siAplica : 'Solo se detecta y se lista aquí.' }} Se cambia en el <code>.env</code> del servidor:
              <code>{{ m.variable }}=aplicar</code> (o <code>simular</code>) y reiniciando el backend.</small>
          </div>
        </div>
      </div>

      <!-- ── Reabiertos ─────────────────────────────────────────── -->
      <div class="card">
        <h3 class="card__title">Reabiertos en ICG <span class="badge badge--gray">{{ d.reabiertos.length }}</span></h3>
        <p class="page__hint">
          Gastos que ICG saldó y después volvieron a quedar pendientes (el pago estaba mal). Los que están Pagados o en
          Pago en Revisión vuelven a Pagos para cargar el comprobante correcto; el anterior queda anulado.
        </p>
        <p v-if="!d.reabiertos.length" class="page__hint">Ninguno por ahora.</p>
        <div v-else class="table-wrap"><table class="grid">
          <thead><tr>
            <th>Tienda</th><th>Factura</th><th>Proveedor</th><th class="r">Total (Bs)</th><th>Estado en la app</th>
            <th>Saldado antes en ICG</th><th>{{ d.modos.reabiertos === 'aplicar' ? 'Qué se hará' : 'Qué haría' }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="r in d.reabiertos" :key="r.idFlujo">
              <td style="white-space:nowrap">{{ r.marca }} · {{ r.tienda || r.codTienda }}</td>
              <td><router-link :to="ruta(r)"><code>{{ r.numserie }}-{{ r.numfactura }}</code></router-link></td>
              <td>{{ r.proveedor || '—' }}</td>
              <td class="r">{{ r.total == null ? '—' : money(r.total) }}</td>
              <td><span class="badge" :class="estClass(r.estado)">{{ estLabel(r.estado) }}</span></td>
              <td style="white-space:nowrap">{{ fecha(r.saldadoAntes.fecha) }}<template v-if="r.saldadoAntes.tipo"> · {{ r.saldadoAntes.tipo }}</template></td>
              <td><span class="badge" :class="r.accion === 'A_PAGOS' ? 'badge--purple' : 'badge--gray'">{{ r.accion === 'A_PAGOS' ? 'Vuelve a Pagos' : 'Solo historial' }}</span></td>
            </tr>
          </tbody>
        </table></div>
      </div>

      <!-- ── Transferencias de mayores ──────────────────────────── -->
      <div class="card">
        <h3 class="card__title">Transferencias de mayores a tiendas</h3>
        <p class="page__hint">
          Misma factura del proveedor en mayores y en una tienda (mismo RIF, mismo número de factura del proveedor, mismo
          monto y fechas a menos de 60 días). La oficial es la de la tienda. Se revisa sola una vez por hora.
        </p>
        <div class="seg__barra">
          <span v-if="d.transferenciasRevisadasEn">
            Última revisión: <b>{{ horaVE(d.transferenciasRevisadasEn) }}</b>
            <template v-if="d.transferencias"> ({{ d.transferencias.segundos }} s)</template>
          </span>
          <span v-else>Todavía no se ha revisado desde que arrancó el servidor.</span>
          <button class="btn btn--primary btn--sm" :disabled="revisando" @click="revisarAhora">
            {{ revisando ? 'Revisando…' : 'Revisar ahora' }}
          </button>
        </div>
        <div v-if="revisando" class="cargando">
          <span class="spinner"></span>
          <div class="cargando__text"><b>Revisando todas las BD de marca…</b><span>Puede tardar un par de minutos.</span></div>
        </div>
        <p v-if="d.errorTransferencias" class="soporte-aviso">⚠ {{ d.errorTransferencias }}</p>

        <template v-if="d.transferencias">
          <p v-if="d.transferencias.transferirOmitido" class="soporte-aviso">
            ⚠ En la última revisión no se pasó nada a Transferido ({{ d.transferencias.transferirOmitido }} pendiente/s): alguna BD de tienda
            no se pudo revisar y una pareja que parece única podría no serlo. Se reintenta en la próxima revisión.
          </p>
          <p v-if="d.transferencias.erroresAplicar.length" class="soporte-aviso">
            ⚠ No se pudieron aplicar: {{ d.transferencias.erroresAplicar.map((e) => `${e.factura} (${e.mensaje})`).join(' · ') }}
          </p>
          <p v-if="riesgos" class="soporte-aviso">⚠ {{ riesgos }} caso(s) con riesgo de pagarse dos veces (marcados abajo).</p>
          <div class="seg__chips">
            <button v-for="a in ACCIONES" :key="a.clave" type="button" class="seg__chip"
                    :class="{ 'seg__chip--on': filtroAccion === a.clave }" @click="filtroAccion = filtroAccion === a.clave ? '' : a.clave">
              <span class="badge" :class="a.clase">{{ d.transferencias.resumen[a.clave] || 0 }}</span> {{ a.texto }}
            </button>
          </div>
          <p v-if="d.transferencias.errores.length" class="page__hint">
            {{ d.transferencias.errores.length }} BD no se pudieron revisar: {{ d.transferencias.errores.map((e) => e.bd).join(', ') }}.
          </p>
          <p v-if="!casos.length" class="page__hint">Nada en esta categoría.</p>
          <div v-else class="table-wrap"><table class="grid">
            <thead><tr>
              <th>{{ d.modos.transferidos === 'aplicar' ? 'Acción' : 'Acción prevista' }}</th>
              <th>Mayores</th><th>Proveedor</th><th>Fecha</th><th class="r">Monto</th><th>Tienda (oficial)</th><th>Detalle</th>
            </tr></thead>
            <tbody>
              <tr v-for="(c, i) in casos" :key="i">
                <td>
                  <span class="badge" :class="accion(c.accion).clase">{{ accion(c.accion).corto }}</span>
                  <span v-if="c.riesgo" class="badge badge--red seg__riesgo" title="Puede pagarse dos veces">⚠ Riesgo</span>
                </td>
                <td>
                  <div style="white-space:nowrap">{{ c.mayores.marca }} · {{ c.mayores.tienda || c.mayores.codTienda }}</div>
                  <router-link :to="ruta(c.mayores)"><code>{{ c.mayores.numserie }}-{{ c.mayores.numfactura }}</code></router-link>
                  <span class="badge seg__estado" :class="estClass(c.mayores.estado)">{{ estLabel(c.mayores.estado) }}</span>
                </td>
                <td>{{ c.mayores.proveedor }}<br><small class="seg__sub">Factura proveedor {{ c.mayores.sufactura }}</small></td>
                <td>{{ fecha(c.mayores.fecha) }}</td>
                <td class="r">{{ money(c.mayores.monto) }}</td>
                <td>
                  <div v-for="(g, j) in c.gemelas" :key="j" class="seg__gemela">
                    <div style="white-space:nowrap">{{ g.marca }} · {{ g.tienda || g.codTienda }}</div>
                    <router-link :to="ruta(g)"><code>{{ g.numserie }}-{{ g.numfactura }}</code></router-link>
                    <span class="badge seg__estado" :class="estClass(g.estado)">{{ estLabel(g.estado) }}</span>
                    <div class="seg__sub">{{ g.pendienteIcg === null ? 'ICG sin revisar' : g.pendienteIcg ? 'Pendiente en ICG' : 'Saldada en ICG' }}</div>
                  </div>
                </td>
                <td class="seg__motivo">{{ c.motivo }}</td>
              </tr>
            </tbody>
          </table></div>
        </template>
      </div>

      <!-- ── Eventos aplicados ──────────────────────────────────── -->
      <div class="card">
        <h3 class="card__title">Aplicados en los últimos 30 días <span class="badge badge--gray">{{ d.recientes.length }}</span></h3>
        <p v-if="!d.recientes.length" class="page__hint">Ninguno{{ ningunoAplica ? ' (todo está en simulación)' : '' }}.</p>
        <div v-else class="table-wrap"><table class="grid">
          <thead><tr><th>Fecha</th><th>Tienda</th><th>Factura</th><th>Evento</th><th>Detalle</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in d.recientes" :key="i">
              <td style="white-space:nowrap">{{ fechaHora(e.fecha) }}</td>
              <td style="white-space:nowrap">{{ e.marca }} · {{ e.codTienda }}</td>
              <td><router-link :to="ruta(e)"><code>{{ e.numserie }}-{{ e.numfactura }}</code></router-link></td>
              <td style="white-space:nowrap">{{ EVENTO[e.decision] || e.decision }}</td>
              <td class="seg__motivo">{{ e.comentario }}</td>
            </tr>
          </tbody>
        </table></div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getSeguimientoIcg, revisarTransferencias } from '../api/admin';
import { ESTADO_LABEL, ESTADO_CLASS } from '../utils/estados';
import { money, fecha, fechaHora } from '../utils/format';

const d = ref(null);
const cargando = ref(false);
const revisando = ref(false);
const error = ref('');
const filtroAccion = ref('');

const ACCIONES = [
  { clave: 'TRANSFERIR', texto: 'Pasan a Transferido', corto: 'Transferido', clase: 'badge--red' },
  { clave: 'AMBIGUO', texto: 'Ambiguos (revisar a mano)', corto: 'Ambiguo', clase: 'badge--amber' },
  { clave: 'ETIQUETA', texto: 'Solo etiqueta', corto: 'Etiqueta', clase: 'badge--icg' },
  { clave: 'YA_TRANSFERIDO', texto: 'Ya transferidos', corto: 'Ya transferido', clase: 'badge--gray' },
  { clave: 'SIN_ACCION', texto: 'Sin acción (no están en la app)', corto: 'Sin acción', clase: 'badge--gray' },
];
const accion = (k) => ACCIONES.find((a) => a.clave === k) || { corto: k, clase: 'badge--gray' };
const EVENTO = { REABIERTO_ICG: 'Reabierto en ICG', TRANSFERIDO: 'Transferido a la tienda', TRANSFERIDO_ICG: 'Etiqueta: transferido en ICG' };

const estLabel = (e) => (e ? ESTADO_LABEL[e] || e : 'Sin entrar al flujo');
const estClass = (e) => (e ? ESTADO_CLASS[e] || 'badge--gray' : 'badge--gray');
const enc = encodeURIComponent;
const ruta = (x) => `/factura/${x.codTienda}/${enc(x.numserie)}/${x.numfactura}/${enc(x.n)}`;
// Hora real del servidor (no un DATETIME de SQL): se muestra en hora de Venezuela.
const horaVE = (v) => new Date(v).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' });

const modos = computed(() => [
  { clave: 'reabiertos', titulo: 'Reabiertos en ICG', variable: 'SEGUIMIENTO_ICG_REABIERTOS', aplicar: d.value.modos.reabiertos === 'aplicar',
    siAplica: 'Cada 10 minutos vuelven a Pagos los que estaban pagados y se anota en su historial.' },
  { clave: 'transferidos', titulo: 'Transferencias de mayores', variable: 'SEGUIMIENTO_ICG_TRANSFERIDOS', aplicar: d.value.modos.transferidos === 'aplicar',
    siAplica: 'Cada hora los de mayores cuya factura de tienda ya está en el flujo pasan a Transferido.' },
]);
const riesgos = computed(() => (d.value?.transferencias?.casos || []).filter((c) => c.riesgo).length);
const ningunoAplica = computed(() => d.value && d.value.modos.reabiertos !== 'aplicar' && d.value.modos.transferidos !== 'aplicar');

// Por defecto no se listan los "Sin acción" (no están en la app): son muchos y no dicen nada.
const casos = computed(() => {
  const todos = d.value?.transferencias?.casos || [];
  return filtroAccion.value ? todos.filter((c) => c.accion === filtroAccion.value) : todos.filter((c) => c.accion !== 'SIN_ACCION');
});

// Si hay una revisión en curso (la de cada hora, o la de "Revisar ahora"), se vuelve a
// preguntar cada 10 s hasta que termine, para que el spinner y los datos sean los reales.
let sondeo = null;
function seguirSiRevisa() {
  revisando.value = !!d.value?.revisandoTransferencias;
  clearTimeout(sondeo);
  if (revisando.value) sondeo = setTimeout(cargar, 10000);
}
async function cargar() {
  cargando.value = true; error.value = '';
  try { d.value = await getSeguimientoIcg(); seguirSiRevisa(); }
  catch (e) { error.value = e.response?.data?.error || e.message; }
  finally { cargando.value = false; }
}
async function revisarAhora() {
  revisando.value = true; error.value = '';
  try { d.value = await revisarTransferencias(); seguirSiRevisa(); }
  catch (e) { error.value = e.response?.data?.error || e.message; revisando.value = false; }
}
onMounted(cargar);
onUnmounted(() => clearTimeout(sondeo));
</script>

<style scoped>
.seg__modos { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 900px) { .seg__modos { grid-template-columns: 1fr; } }
.seg__modo { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
.seg__modo small { display: block; color: var(--muted); margin-top: 3px; line-height: 1.45; }
.seg__barra { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; font-size: 14px; }
.seg__barra > span { margin-right: auto; }
.seg__chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.seg__chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 4px 12px 4px 6px; font: inherit; font-size: 13px; cursor: pointer; }
.seg__chip--on { border-color: var(--accent-dark); box-shadow: 0 0 0 2px var(--accent-soft); }
.seg__chip .badge--icg { margin-left: 0; }
.seg__estado { margin-left: 6px; }
.seg__riesgo { display: table; margin-top: 4px; }
.seg__sub { color: var(--muted); }
.seg__gemela + .seg__gemela { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border); }
.seg__motivo { font-size: 13px; color: #374151; min-width: 220px; }
</style>
