<template>
  <span v-if="saldado" class="badge badge--icg" :class="{ 'badge--icg-bloque': bloque }" :title="tituloSaldado">
    Saldado en ICG<template v-if="saldado.fecha"> · {{ fecha(saldado.fecha) }}</template><template v-if="saldado.tipo"> · {{ saldado.tipo }}</template>
  </span>
  <span v-if="transferido" class="badge badge--icg badge--icg-transf" :class="{ 'badge--icg-bloque': bloque }" :title="tituloTransferido">
    Transferido en ICG a {{ destino }}
  </span>
  <span v-if="mayores" class="badge badge--icg" :class="[pagadoPorMayores ? 'badge--icg-alerta' : 'badge--icg-transf', { 'badge--icg-bloque': bloque }]" :title="tituloMayores">
    {{ textoMayores }}
  </span>
</template>

<script setup>
// Etiquetas informativas del seguimiento de ICG. Solo visualización: no cambian nada del flujo.
//  - saldado: "Saldado en ICG · fecha · tipo de pago" (seguimientoIcg.service.js): { fecha, tipo } o null.
//  - transferido: en un gasto de mayores, la factura de la tienda a la que se transfirió en ICG
//    (traspasosMayores.service.js): { codTienda, tienda, marca, numserie, numfactura, n } o null.
//  - mayores: en una factura de tienda, la misma factura en mayores: { marca, numserie, numfactura,
//    estado, transferido } o null. Avisa para no pagarla dos veces.
import { computed } from 'vue';
import { fecha } from '../utils/format';
import { ESTADO_LABEL } from '../utils/estados';

// bloque: en su propia línea, debajo del contenido de la celda (tablas sin columna de estado).
const props = defineProps({
  saldado: { type: Object, default: null },
  transferido: { type: Object, default: null },
  mayores: { type: Object, default: null },
  // Estado en la app de este gasto: con la factura de la tienda ya Pagada, el aviso de
  // mayores queda informativo (ya no hay pago doble que evitar).
  estado: { type: String, default: '' },
  bloque: { type: Boolean, default: false },
});

const tituloSaldado = computed(() => {
  const s = props.saldado;
  if (!s) return '';
  let t = 'ICG ya registró el pago de este gasto';
  if (s.fecha) t += ` el ${fecha(s.fecha)}`;
  if (s.tipo) t += ` (${s.tipo})`;
  return `${t}. Es solo informativo: el gasto sigue su flujo en la app.`;
});
const destino = computed(() => {
  const d = props.transferido;
  return d ? [d.marca, d.tienda, `${d.numserie}-${d.numfactura}`].filter(Boolean).join(' · ') : '';
});
const tituloTransferido = computed(() => (props.transferido
  ? `En ICG este gasto de mayores también está registrado en ${destino.value}. La factura oficial es la de la tienda.`
  : ''));

// Mayores ya pagó o ya cargó el comprobante: riesgo de pagarla dos veces → en rojo.
const yaPagadaAqui = computed(() => props.estado === 'PAGADO');
const pagadoPorMayores = computed(() => !yaPagadaAqui.value && ['PAGADO', 'PAGO_EN_REVISION'].includes(props.mayores?.estado));
const facturaMayores = computed(() => {
  const m = props.mayores;
  return m ? [m.marca, `${m.numserie}-${m.numfactura}`].filter(Boolean).join(' · ') : '';
});
const textoMayores = computed(() => {
  const m = props.mayores;
  if (!m) return '';
  if (yaPagadaAqui.value) return `También en mayores · ${facturaMayores.value}`;
  if (m.estado === 'PAGADO') return `Ya pagado por mayores · ${facturaMayores.value}`;
  // Transferido estando en Pago en Revisión: mayores ya había cargado el comprobante.
  if (m.estado === 'PAGO_EN_REVISION') return `${m.transferido ? 'Pago cargado por mayores' : 'Pago en revisión en mayores'} · ${facturaMayores.value}`;
  if (m.transferido) return `Transferido desde mayores · ${facturaMayores.value}`;
  return `También en mayores · ${facturaMayores.value}${m.estado ? ` · ${ESTADO_LABEL[m.estado] || m.estado}` : ''}`;
});
const tituloMayores = computed(() => {
  const m = props.mayores;
  if (!m) return '';
  const estado = m.estado ? (ESTADO_LABEL[m.estado] || m.estado) : 'sin entrar al flujo';
  return `Este gasto también está registrado en mayores (${facturaMayores.value}, ${estado}${m.transferido ? '; ya pasó a Transferido y la oficial es esta' : ''}). `
    + 'Revísalo antes de enviarlo o pagarlo para no pagarlo dos veces.';
});
</script>
