<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Reportería</h1>
        <p class="page__hint">Elige el tipo de reporte, la zona/tienda y el rango. Se muestran en pantalla y puedes exportarlos a Excel.</p>
      </div>
    </div>

    <div class="card filtros">
      <div class="field" :class="{ 'field--active': tipo !== 'gastos' }">
        <label>Tipo de reporte</label>
        <select v-model="tipo">
          <option v-for="(t, k) in TIPOS" :key="k" :value="k">{{ t.label }}</option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': zona }">
        <label>Zona</label>
        <select v-model="zona" @change="onZona">
          <option value="">Selecciona zona…</option>
          <option value="TODAS">Todas las zonas</option>
          <option v-for="z in zonas" :key="z.Zona" :value="z.Zona">{{ z.Zona }} ({{ z.Tiendas }})</option>
        </select>
      </div>
      <div class="field" :class="{ 'field--active': codTienda }">
        <label>Tienda (opcional)</label>
        <select v-model="codTienda" :disabled="!zona || zona === 'TODAS'">
          <option value="">Todas las de la zona</option>
          <option v-for="t in tiendas" :key="t.CodTienda" :value="t.CodTienda">{{ t.Tienda }}<template v-if="t.Marca"> — {{ t.Marca }}</template></option>
        </select>
      </div>
      <template v-if="esSaldos">
        <div class="field" :class="{ 'field--active': fechaSaldos }"><label>Fecha</label><input type="date" v-model="fechaSaldos" /></div>
      </template>
      <template v-else>
        <div class="field" :class="{ 'field--active': desde }"><label>Desde</label><input type="date" v-model="desde" /></div>
        <div class="field" :class="{ 'field--active': hasta }"><label>Hasta</label><input type="date" v-model="hasta" /></div>
      </template>
      <button class="btn btn--primary" :disabled="!zona || loading" @click="generar">{{ loading ? 'Generando…' : 'Generar' }}</button>
    </div>

    <div v-if="loading" class="cargando">
      <span class="spinner"></span>
      <div class="cargando__text">
        <b>Generando reporte…</b>
        <span>Por favor espere, esto puede tardar unos segundos.</span>
      </div>
    </div>
    <template v-else-if="rep">
      <template v-if="repKind === 'saldos'">
        <div class="fondos__resumen">
          <span>Tiendas: <b>{{ rep.totales.count }}</b></span>
          <span>Total saldo: <b>{{ money(rep.totales.totalSaldo) }} Bs</b></span>
          <button class="btn btn--sm" :disabled="!rep.rows.length" @click="exportar" style="margin-left:auto">⬇ Exportar a Excel</button>
        </div>
        <div class="table-wrap" v-if="rep.rows.length"><table class="grid">
          <thead><tr><th>Zona</th><th>Tienda</th><th>Marca</th><th class="r">Saldo (Bs)</th></tr></thead>
          <tbody>
            <tr v-for="(f, i) in rep.rows" :key="i">
              <td>{{ f.zona || '—' }}</td><td>{{ f.tienda || '—' }}</td><td>{{ f.marca || '—' }}</td>
              <td class="r">{{ money(f.saldo) }}</td>
            </tr>
          </tbody>
        </table></div>
        <div v-else class="empty card">Sin saldos para los filtros.</div>
      </template>
      <template v-else>
        <div class="fondos__resumen">
          <span>Facturas: <b>{{ rep.totales.count }}</b></span>
          <span>Total: <b>{{ money(rep.totales.totalVes) }} Bs</b></span>
          <span v-for="(n, e) in rep.totales.porEstado" :key="e" class="badge" :class="estClass(e)">{{ estLabel(e) }}: {{ n }}</span>
          <button class="btn btn--sm" :disabled="!rep.rows.length" @click="exportar" style="margin-left:auto">⬇ Exportar a Excel</button>
        </div>
        <div class="table-wrap" v-if="rep.rows.length"><table class="grid">
          <thead><tr><th>Zona</th><th>Tienda</th><th>Marca</th><th>Factura</th><th>Fecha</th><th>Proveedor</th><th>Tipo de gasto</th><th class="r">Total (Bs)</th><th class="r">Pendiente (Bs)</th><th>Estado</th></tr></thead>
          <tbody>
            <tr v-for="(f, i) in rep.rows" :key="i">
              <td>{{ f.zona || '—' }}</td><td>{{ f.tienda || '—' }}</td><td>{{ f.marca || '—' }}</td>
              <td><code>{{ f.numserie }}-{{ f.numfactura }}</code></td>
              <td>{{ fecha(f.fecha) }}</td><td>{{ f.proveedor || '—' }}</td><td>{{ f.tipoGasto || '—' }}</td>
              <td class="r">{{ money(f.totalVes) }}</td><td class="r">{{ money(f.pendienteVes) }}</td>
              <td><span class="badge" :class="estClass(f.estado)">{{ estLabel(f.estado) }}</span></td>
            </tr>
          </tbody>
        </table></div>
        <div v-else class="empty card">Sin resultados para los filtros aplicados.</div>
      </template>
    </template>
    <p v-else class="page__hint">Selecciona el tipo de reporte y la zona, y presiona Generar.</p>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import * as XLSX from 'xlsx';
import { getZonas, getTiendas } from '../api/facturas';
import { getReporte, getSaldos } from '../api/reportes';
import { ESTADO_LABEL, ESTADO_CLASS } from '../utils/estados';
import { money, fecha, hoyVE } from '../utils/format';

const TIPOS = {
  gastos: { label: 'Gastos (general)', estado: null, saldos: false },
  pendiente_tesoreria: { label: 'Pendiente por aprobar Tesorería', estado: 'PENDIENTE_TESORERIA', saldos: false },
  pendiente_auditoria: { label: 'Pendiente por Auditoría', estado: 'PENDIENTE_AUDITORIA', saldos: false },
  pendiente_pago: { label: 'Pendientes por pagar', estado: 'PENDIENTE_PAGO', saldos: false },
  aprobado: { label: 'Aprobado (pagado)', estado: 'PAGADO', saldos: false },
  devueltos: { label: 'Devueltos', estado: 'DEVUELTO', saldos: false },
  saldos: { label: 'General de saldos', estado: null, saldos: true },
};

const zonas = ref([]);
const tiendas = ref([]);
const tipo = ref('gastos');
const zona = ref('');
const codTienda = ref('');
const estado = ref('');
const desde = ref('');
const hasta = ref('');
const fechaSaldos = ref(hoyVE());
const rep = ref(null);
const repKind = ref('gastos');
const loading = ref(false);

const esSaldos = computed(() => TIPOS[tipo.value].saldos);
const estLabel = (e) => ESTADO_LABEL[e] || e;
const estClass = (e) => ESTADO_CLASS[e] || 'badge--gray';

async function onZona() {
  codTienda.value = '';
  tiendas.value = (zona.value && zona.value !== 'TODAS') ? await getTiendas(zona.value) : [];
}

async function generar() {
  if (!zona.value) return;
  loading.value = true;
  try {
    if (esSaldos.value) {
      const params = {};
      if (zona.value !== 'TODAS') params.zona = zona.value;
      if (codTienda.value) params.codTienda = codTienda.value;
      params.fecha = fechaSaldos.value;
      rep.value = await getSaldos(params);
      repKind.value = 'saldos';
    } else {
      const params = {};
      if (zona.value !== 'TODAS') params.zona = zona.value;
      if (codTienda.value) params.codTienda = codTienda.value;
      if (tipo.value === 'gastos') {
        // Gastos (general) = solo lo NO procesado (pendiente por el analista).
        params.soloERP = '1';
        params.estado = 'PENDIENTE_ANALISTA';
      } else {
        const est = TIPOS[tipo.value].estado;
        if (est) params.estado = est;
      }
      if (desde.value) params.desde = desde.value;
      if (hasta.value) params.hasta = hasta.value;
      rep.value = await getReporte(params);
      repKind.value = 'gastos';
    }
  } finally { loading.value = false; }
}

function exportar() {
  if (!rep.value || !rep.value.rows.length) return;
  let data;
  if (repKind.value === 'saldos') {
    data = rep.value.rows.map((f) => ({ Zona: f.zona, Tienda: f.tienda, Marca: f.marca, 'Saldo (Bs)': Number(f.saldo) || 0 }));
  } else {
    data = rep.value.rows.map((f) => ({
      Zona: f.zona, Tienda: f.tienda, Marca: f.marca, Factura: `${f.numserie}-${f.numfactura}`, Fecha: fecha(f.fecha),
      Proveedor: f.proveedor, 'Tipo de gasto': f.tipoGasto, 'Total (Bs)': Number(f.totalVes) || 0, 'Pendiente (Bs)': Number(f.pendienteVes) || 0, Estado: estLabel(f.estado),
    }));
  }
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, `reporte_${tipo.value}_${hoyVE()}.xlsx`);
}

onMounted(async () => { zonas.value = await getZonas(); });
</script>
