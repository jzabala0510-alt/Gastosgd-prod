<template>
  <section class="page" v-if="f">
    <div class="page__head">
      <div>
        <h1 class="page__title">
          Factura {{ f.NUMSERIE }}-{{ f.NUMFACTURA }}
          <span class="badge" :class="estClass(f.Estado)">{{ estLabel(f.Estado) }}</span>
        </h1>
        <p class="page__hint">{{ f.tienda?.Tienda }} · {{ f.tienda?.Zona }} · {{ f.tienda?.Marca }}</p>
      </div>
      <div class="head-actions"><button class="btn" @click="$router.back()">← Volver</button></div>
    </div>

    <p v-if="msg" class="login__error">{{ msg }}</p>

    <div class="cols">
      <div class="card">
        <h3 class="card__title">Datos de la factura</h3>
        <dl class="dl">
          <div><dt>Proveedor</dt><dd>{{ f.Proveedor || '—' }}</dd></div>
          <div><dt>RIF</dt><dd>{{ f.RifProveedor || '—' }}</dd></div>
          <div><dt>Nº factura prov.</dt><dd>{{ f.SUFACTURA || '—' }}</dd></div>
          <div><dt>Nº control</dt><dd>{{ f.NUMCONTROL || '—' }}</dd></div>
          <div><dt>Fecha</dt><dd>{{ fecha(f.FECHA) }}</dd></div>
          <div><dt>Tipo de documento</dt><dd><b>{{ tipoDoc(f.TIPODOC) }}</b></dd></div>
          <div><dt>Tipo de gasto</dt><dd>{{ f.TipoGasto || '—' }}</dd></div>
          <div class="full"><dt>Observaciones</dt><dd>{{ f.OBSERVACIONES || '—' }}</dd></div>
        </dl>
        <div class="totals">
          <span>Total: <b>{{ money(f.TotalVes) }}</b> Bs</span>
          <span class="totals__total">Pendiente: <b>{{ money(f.PendienteVes) }}</b> Bs</span>
        </div>
      </div>

      <div class="card">
        <h3 class="card__title">Soportes ({{ f.adjuntos.length }})</h3>
        <p v-if="!f.adjuntos.length" class="page__hint">Sin soportes aún.</p>
        <ul class="adjuntos">
          <li v-for="a in f.adjuntos" :key="a.IdAdjunto">
            <a :href="`/api/uploads/${a.RutaArchivo}`" target="_blank" rel="noopener">
              <img v-if="img(a)" :src="`/api/uploads/${a.RutaArchivo}`" class="adjuntos__thumb" alt="" />
              <span v-else class="adjuntos__file">📄</span>
              <span class="adjuntos__name">{{ a.NombreOriginal }}</span>
            </a>
            <span class="badge" :class="a.Tipo === 'COMPROBANTE' ? 'badge--green' : 'badge--gray'">{{ a.Tipo }}</span>
            <button v-if="puedeAdjuntar && a.Tipo !== 'COMPROBANTE'" class="adjuntos__del"
                    :disabled="busy" title="Eliminar soporte" @click="borrarAdjunto(a)">🗑</button>
          </li>
        </ul>
        <div v-if="puedeAdjuntar" class="uploader">
          <label class="uploader__drop">
            <input type="file" multiple @change="onFiles" hidden />
            <span class="uploader__icon">📎</span>
            <span class="uploader__droptext"><b>Haz clic para seleccionar archivos</b><small>Fotos, PDF o documentos del soporte</small></span>
          </label>
          <ul v-if="nuevos.length" class="uploader__files">
            <li v-for="(file, i) in nuevos" :key="i" class="uploader__chip">
              <span>{{ file.name }}</span>
              <button type="button" @click="nuevos.splice(i, 1)" aria-label="Quitar">✕</button>
            </li>
          </ul>
          <button class="btn btn--primary uploader__btn" :class="{ 'btn--pulse': nuevos.length && !busy }"
                  :disabled="!nuevos.length || busy" @click="subir">
            {{ busy ? 'Subiendo…' : (nuevos.length ? `⬆ Subir ${nuevos.length} archivo${nuevos.length > 1 ? 's' : ''}` : 'Selecciona archivos para subir') }}
          </button>
        </div>
      </div>
    </div>

    <div class="card" v-if="f.lineas && f.lineas.length">
      <h3 class="card__title">Líneas del gasto ({{ f.lineas.length }})</h3>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Descripción</th><th>Referencia</th><th class="r">Cantidad</th><th class="r">Precio (Bs)</th><th class="r">Total (Bs)</th></tr></thead>
        <tbody>
          <tr v-for="(l, i) in f.lineas" :key="i">
            <td>{{ l.Descripcion || '—' }}</td>
            <td>{{ l.Referencia || '—' }}</td>
            <td class="r">{{ l.Cantidad }}</td>
            <td class="r">{{ money(l.PRECIO) }}</td>
            <td class="r">{{ money(l.TOTAL) }}</td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <!-- Decisión normal (analista / tesorería / auditor) -->
    <div class="card" v-if="puedeDecidir">
      <h3 class="card__title">{{ tituloDecision }}</h3>
      <p v-if="sinSoportes" class="soporte-aviso">⚠ Debes subir al menos un soporte antes de poder aprobar este gasto.</p>
      <AccionesFlujo :busy="busy" :disabled-aprobar="sinSoportes" :aprobar-label="aprobarLabel" :solo-aprobar="esAna" @decidir="decidir" />
    </div>

    <!-- Sección exclusiva del pagador -->
    <div class="card" v-if="esPag">
      <h3 class="card__title">Registrar Pago</h3>
      <p class="page__hint">Sube el comprobante de pago para confirmar. Es obligatorio antes de registrar.</p>
      <div class="uploader">
        <label class="uploader__drop">
          <input type="file" multiple @change="onComprobantes" hidden />
          <span class="uploader__icon">🧾</span>
          <span class="uploader__droptext"><b>Haz clic para seleccionar el comprobante</b><small>Captura o PDF del pago realizado</small></span>
        </label>
        <ul v-if="comprobantes.length" class="uploader__files">
          <li v-for="(file, i) in comprobantes" :key="i" class="uploader__chip">
            <span>{{ file.name }}</span>
            <button type="button" @click="comprobantes.splice(i, 1)" aria-label="Quitar">✕</button>
          </li>
        </ul>
      </div>
      <div style="margin-top:14px">
        <button class="btn btn--primary uploader__btn" :class="{ 'btn--pulse': comprobantes.length && !busy }"
                :disabled="!comprobantes.length || busy" @click="pagar">
          {{ busy ? 'Registrando…' : (comprobantes.length
            ? `✓ Registrar pago (${comprobantes.length} comprobante${comprobantes.length > 1 ? 's' : ''})`
            : 'Selecciona el comprobante para continuar') }}
        </button>
      </div>
    </div>

    <!-- Sección exclusiva del auditor cuando el pago está en revisión -->
    <div class="card" v-if="esAudPago">
      <h3 class="card__title">Confirmar Pago</h3>
      <p class="page__hint">El Pagador ha subido el comprobante de pago. Revisa los adjuntos y confirma o devuelve.</p>
      <div class="acciones-inline" style="margin-top:12px">
        <button class="btn btn--primary" :disabled="busy" @click="confirmarDesdeDetalle('CONFIRMADO')">
          {{ busy ? 'Procesando…' : '✓ Confirmar pago' }}
        </button>
        <button class="btn btn--warn" :disabled="busy" @click="confirmarDesdeDetalle('DEVUELTO')">
          Devolver al Pagador
        </button>
      </div>
    </div>

    <div class="card">
      <h3 class="card__title">Historial del flujo</h3>
      <ol class="timeline">
        <li v-for="(a, i) in f.aprobaciones" :key="i">
          <span class="timeline__dot" :class="['APROBADO','PAGADO'].includes(a.Decision) ? 'timeline__dot--green' : 'timeline__dot--red'"></span>
          <div>
            <b>{{ etapa(a.Etapa) }}: {{ a.Decision }}</b>
            <small>{{ a.Usuario }} · {{ fechaHora(a.Fecha) }}</small>
            <p v-if="a.Comentario" class="timeline__comment">{{ a.Comentario }}</p>
          </div>
        </li>
        <li v-if="!f.aprobaciones.length">
          <span class="timeline__dot timeline__dot--amber"></span>
          <div><b>Pendiente del Analista</b><small>Entró automáticamente al flujo</small></div>
        </li>
      </ol>
    </div>
  </section>
  <p v-else class="page__hint" style="padding:28px">Cargando…</p>

  <ModalFeedback
    :visible="modal.visible"
    :titulo="modal.titulo"
    :mensaje="modal.mensaje"
    :tipo="modal.tipo"
    @close="onModalClose"
  />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getFacturaDetalle, accionAnalista, accionTesoreria, accionAuditoria, uploadAdjuntos, deleteAdjunto, pagarFactura, confirmarPago, marcarVisto } from '../api/facturas';
import { useAuthStore } from '../stores/auth';
import { useNotifStore } from '../stores/notificaciones';
import { useConfirm } from '../composables/useConfirm';
import AccionesFlujo from '../components/AccionesFlujo.vue';
import ModalFeedback from '../components/ModalFeedback.vue';
import { ESTADO_LABEL, ESTADO_CLASS } from '../utils/estados';
import { money, fecha, fechaHora } from '../utils/format';

const props = defineProps({ codTienda: [String, Number], numserie: String, numfactura: [String, Number], n: String });
const auth = useAuthStore();
const notif = useNotifStore();
const { confirm } = useConfirm();
const router = useRouter();
const f = ref(null);
const busy = ref(false);
const msg = ref('');
const nuevos = ref([]);
const comprobantes = ref([]);
const modal = ref({ visible: false, titulo: '', mensaje: '', tipo: 'success' });

const estLabel = (e) => ESTADO_LABEL[e] || e;
const estClass = (e) => ESTADO_CLASS[e] || 'badge--gray';
const etapa = (e) => ({ ANALISTA: 'Analista', TESORERIA: 'Tesorería', AUDITORIA: 'Auditoría', PAGADOR: 'Pagos', AUDITOR_PAGO: 'Confirmación de pago' }[e] || e);
const tipoDoc = (t) => t === 12 ? 'Factura Gastos' : t === 20 ? 'Gastos no deducibles' : '—';
const img = (a) => (a.Mime || '').startsWith('image/');

const payload = computed(() => ({
  codTienda: Number(props.codTienda), numserie: props.numserie,
  numfactura: Number(props.numfactura), n: props.n, marca: f.value?.tienda?.Marca,
}));

const esAna = computed(() => ['PENDIENTE_ANALISTA', 'DEVUELTO', 'RECHAZADO'].includes(f.value?.Estado) && auth.esAnalista);
const sinSoportes = computed(() => esAna.value && !(f.value?.adjuntos || []).some((a) => a.Tipo !== 'COMPROBANTE'));
const esTes = computed(() => f.value?.Estado === 'PENDIENTE_TESORERIA' && auth.esTesoreria);
const esAud = computed(() => f.value?.Estado === 'PENDIENTE_AUDITORIA' && auth.esAuditor);
const esPag = computed(() => f.value?.Estado === 'PENDIENTE_PAGO' && auth.esPagador);
const esAudPago = computed(() => f.value?.Estado === 'PAGO_EN_REVISION' && auth.esAuditor);
const puedeDecidir = computed(() => esAna.value || esTes.value || esAud.value);
const puedeAdjuntar = computed(() => f.value?.Estado !== 'PAGADO' && (auth.esAnalista || auth.esTesoreria || auth.esAuditor));

const tituloDecision = computed(() =>
  esAna.value ? 'Revisión del Analista' : esTes.value ? 'Decisión de Tesorería' : 'Decisión de Auditoría');

const aprobarLabel = computed(() => {
  if (esTes.value) return 'Aprobar y enviar a Auditoría';
  if (esAud.value) return 'Aprobar y enviar a Pagos';
  if (!esAna.value) return 'Aprobar';
  return ['DEVUELTO', 'RECHAZADO'].includes(f.value?.Estado) ? 'Reenviar a Tesorería' : 'Aprobar y enviar a Tesorería';
});

// Tras una acción, volver al módulo donde se actuó (sirve para multi-rol):
// el estado de la factura aún refleja la etapa previa a la acción.
const destino = computed(() => {
  if (esAna.value) return '/gastos';
  if (esTes.value) return '/tesoreria';
  if (esAud.value || esAudPago.value) return '/auditoria';
  if (esPag.value) return '/pagos';
  return '/';
});

const mensajeDecision = (decision) => {
  if (decision === 'APROBADO') {
    if (esAna.value) return { titulo: 'Aprobada', mensaje: 'Factura enviada a Tesorería.', tipo: 'success' };
    if (esTes.value) return { titulo: 'Aprobada', mensaje: 'Factura enviada a Auditoría.', tipo: 'success' };
    if (esAud.value) return { titulo: 'Aprobada', mensaje: 'Factura enviada al módulo de Pagos.', tipo: 'success' };
  }
  if (decision === 'DEVUELTO') return { titulo: 'Devuelta', mensaje: 'Factura devuelta al Analista.', tipo: 'warn' };
  return { titulo: 'Rechazada', mensaje: 'Factura rechazada.', tipo: 'error' };
};

async function cargar() {
  f.value = await getFacturaDetalle(Number(props.codTienda), props.numserie, Number(props.numfactura), props.n);
  // Avisos informativos del analista (PAGADO/RECHAZADO): al abrirlos se marcan vistos.
  // Las DEVUELTO no: son tareas que solo salen del contador al reenviarlas.
  if (['PAGADO', 'RECHAZADO'].includes(f.value?.Estado) && auth.esAnalista) {
    marcarVisto({ codTienda: Number(props.codTienda), numserie: props.numserie, numfactura: Number(props.numfactura), n: props.n })
      .then(() => notif.refrescar()).catch(() => {});
  }
}
function onFiles(e) { nuevos.value.push(...Array.from(e.target.files)); e.target.value = ''; }
function onComprobantes(e) { comprobantes.value.push(...Array.from(e.target.files)); e.target.value = ''; }

async function subir() {
  busy.value = true; msg.value = '';
  try {
    const fd = new FormData();
    Object.entries(payload.value).forEach(([k, v]) => { if (v != null) fd.append(k, v); });
    nuevos.value.forEach((file) => fd.append('archivos', file));
    await uploadAdjuntos(fd);
    nuevos.value = [];
    await cargar();
  } catch (e) { msg.value = e.response?.data?.error || 'No se pudieron subir los soportes.'; }
  finally { busy.value = false; }
}

async function borrarAdjunto(a) {
  const conf = await confirm({ titulo: 'Eliminar soporte', mensaje: `¿Eliminar el soporte "${a.NombreOriginal}"?`, tipo: 'danger', labelConfirmar: 'Eliminar' });
  if (!conf.ok) return;
  busy.value = true; msg.value = '';
  try {
    await deleteAdjunto(a.IdAdjunto);
    await cargar();
  } catch (e) { msg.value = e.response?.data?.error || 'No se pudo eliminar el soporte.'; }
  finally { busy.value = false; }
}

const TEXTOS_DECISION = {
  APROBADO: { titulo: 'Confirmar aprobación', tipo: 'info', labelConfirmar: 'Confirmar' },
  DEVUELTO: { titulo: 'Confirmar devolución', mensaje: 'La factura volverá a la etapa anterior para su corrección.', tipo: 'warn', labelConfirmar: 'Devolver' },
  RECHAZADO: { titulo: 'Confirmar rechazo', mensaje: 'Esta acción rechaza la factura.', tipo: 'danger', labelConfirmar: 'Rechazar' },
};

async function decidir({ decision, comentario }) {
  const necesitaComentario = decision !== 'APROBADO' && !comentario.trim();
  const conf = await confirm({
    ...TEXTOS_DECISION[decision],
    mensaje: TEXTOS_DECISION[decision].mensaje || `${aprobarLabel.value}.`,
    pedirComentario: necesitaComentario,
    comentarioRequerido: necesitaComentario,
    placeholder: decision === 'DEVUELTO' ? 'Motivo de la devolución…' : 'Motivo del rechazo…',
    comentario,
  });
  if (!conf.ok) return;
  busy.value = true; msg.value = '';
  try {
    const comentarioFinal = conf.comentario;
    if (esAna.value) await accionAnalista({ ...payload.value, decision, comentario: comentarioFinal });
    else if (esTes.value) await accionTesoreria({ ...payload.value, decision, comentario: comentarioFinal });
    else await accionAuditoria({ ...payload.value, decision, comentario: comentarioFinal });
    modal.value = { ...mensajeDecision(decision), visible: true };
  } catch (e) { msg.value = e.response?.data?.error || 'No se pudo registrar la decisión.'; }
  finally { busy.value = false; }
}

async function pagar() {
  const conf = await confirm({ titulo: 'Registrar pago', mensaje: 'Se subirá el comprobante y la factura quedará en revisión por el Auditor.', tipo: 'info', labelConfirmar: 'Registrar pago' });
  if (!conf.ok) return;
  busy.value = true; msg.value = '';
  try {
    const fd = new FormData();
    Object.entries(payload.value).forEach(([k, v]) => { if (v != null) fd.append(k, v); });
    comprobantes.value.forEach((file) => fd.append('archivos', file));
    await pagarFactura(fd);
    comprobantes.value = [];
    modal.value = { visible: true, titulo: 'Pago registrado', mensaje: 'Comprobante guardado. El Auditor debe confirmar el pago.', tipo: 'success' };
  } catch (e) { msg.value = e.response?.data?.error || 'No se pudo registrar el pago.'; }
  finally { busy.value = false; }
}

async function confirmarDesdeDetalle(decision) {
  const conf = decision === 'CONFIRMADO'
    ? await confirm({ titulo: 'Confirmar pago', mensaje: 'La factura quedará marcada como pagada definitivamente.', tipo: 'info', labelConfirmar: 'Confirmar pago' })
    : await confirm({ titulo: 'Devolver al Pagador', mensaje: 'El comprobante será rechazado y el Pagador deberá subir uno nuevo.', tipo: 'warn', pedirComentario: true, comentarioRequerido: true, placeholder: 'Motivo de la devolución…', labelConfirmar: 'Devolver' });
  if (!conf.ok) return;
  busy.value = true; msg.value = '';
  try {
    await confirmarPago({ ...payload.value, decision, comentario: conf.comentario });
    if (decision === 'CONFIRMADO') modal.value = { visible: true, titulo: 'Pago confirmado', mensaje: 'La factura fue marcada como pagada.', tipo: 'success' };
    else modal.value = { visible: true, titulo: 'Devuelta al Pagador', mensaje: 'El Pagador deberá subir un nuevo comprobante.', tipo: 'warn' };
  } catch (e) { msg.value = e.response?.data?.error || 'No se pudo procesar la decisión.'; }
  finally { busy.value = false; }
}

function onModalClose() {
  modal.value.visible = false;
  router.push(destino.value);
}

onMounted(cargar);
</script>
