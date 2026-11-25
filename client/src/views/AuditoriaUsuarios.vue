<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Auditoría de usuarios</h1>
        <p class="page__hint">Elige un usuario y un rango de fechas para ver todo lo que hizo: qué gastos trabajó, qué decidió en cada uno, los soportes que subió y los saldos que cargó.</p>
      </div>
    </div>

    <div class="card filtros">
      <div class="field" style="flex:2" :class="{ 'field--active': idUsuario }">
        <label>Usuario</label>
        <!-- Un solo campo: al abrirlo muestra todos; al escribir filtra (la coincidencia exacta primero). -->
        <div class="combo">
          <input ref="comboInput" v-model="buscar" class="combo__input" placeholder="Escribe o elige un usuario…" autocomplete="off"
                 @focus="abrirCombo" @click="abrirCombo" @input="alEscribir" @keydown="teclaCombo" />
          <span class="combo__caret" @mousedown.prevent="toggleCombo">▾</span>
          <div v-if="comboAbierto" class="combo__overlay" @mousedown="cerrarCombo"></div>
          <ul v-if="comboAbierto" class="combo__lista" role="listbox">
            <li v-for="(u, i) in usuariosFiltrados" :key="u.idUsuario" role="option"
                :class="{ 'combo__op--activa': i === resaltado, 'combo__op--sel': u.idUsuario === idUsuario }"
                @mousedown.prevent="elegir(u)" @mouseenter="resaltado = i">{{ u.nombre }}</li>
            <li v-if="!usuariosFiltrados.length" class="combo__vacio">Sin coincidencias</li>
          </ul>
        </div>
      </div>
      <div class="field" :class="{ 'field--active': desde }"><label>Desde</label><input type="date" v-model="desde" :max="hasta || undefined" /></div>
      <div class="field" :class="{ 'field--active': hasta }"><label>Hasta</label><input type="date" v-model="hasta" :min="desde || undefined" /></div>
      <button class="btn btn--primary" :disabled="!idUsuario || cargando" @click="consultar">{{ cargando ? 'Consultando…' : 'Consultar' }}</button>
    </div>

    <div v-if="cargando" class="cargando">
      <span class="spinner"></span>
      <div class="cargando__text"><b>Consultando la actividad…</b><span>Puede tardar unos segundos con rangos largos.</span></div>
    </div>
    <p v-else-if="error" class="soporte-aviso">⚠ {{ error }}</p>

    <template v-else-if="d">
      <div class="card au__resumen">
        <div>
          <h3 class="card__title" style="margin:0">{{ d.usuario.nombre }}</h3>
          <p class="page__hint" style="margin:4px 0 6px">
            {{ rangoTexto }} · Zonas: {{ d.usuario.zonas.length ? d.usuario.zonas.join(', ') : 'todas' }}
          </p>
          <div class="au__permisos">
            <span class="au__permisos-lbl">Permisos:</span>
            <span v-for="r in permisosVisibles" :key="r" class="badge badge--gray">{{ ROL_LABEL[r] || r }}</span>
            <span v-if="!permisosVisibles.length" class="page__hint">ninguno</span>
          </div>
        </div>
        <div class="au__kpis">
          <div><b>{{ d.gastosTrabajados }}</b><span>gastos trabajados</span></div>
          <div><b>{{ d.movimientos.length }}</b><span>movimientos</span></div>
          <button class="btn btn--primary btn--sm" :disabled="!d.movimientos.length && !d.bandejas.length" @click="exportar">⬇ Exportar a Excel</button>
        </div>
      </div>

      <!-- Lo que hizo: una tarjeta por cada módulo en el que trabaja (según sus permisos) -->
      <h3 class="au__seccion">Lo que hizo en cada módulo</h3>
      <div class="au__bandejas">
        <div v-for="t in tarjetas" :key="t.clave" class="card au__bandeja" :class="{ 'au__bandeja--activa': t.gastos || t.movimientos }">
          <div class="au__bandeja-head">
            <h4>{{ t.titulo }}</h4>
            <span v-if="!t.porPermiso" class="au__sinpermiso" title="Hizo movimientos aquí aunque hoy no tiene este permiso">sin permiso hoy</span>
          </div>
          <template v-if="t.gastos || t.movimientos">
            <p class="au__grande"><b>{{ t.unidad === 'gastos' ? t.gastos : t.movimientos }}</b> {{ t.unidad === 'gastos' ? (t.gastos === 1 ? 'gasto trabajado' : 'gastos trabajados') : (t.movimientos === 1 ? 'movimiento' : 'movimientos') }}</p>
            <p v-for="a in t.acciones" :key="a.accion" class="au__linea"><b>{{ a.n }}</b> {{ a.accion }}</p>
          </template>
          <p v-else class="au__vacio">Sin movimientos en este rango.</p>
          <!-- Contexto de la bandeja: lo que llegó en sus zonas y quién lo trabajó -->
          <details v-for="b in t.bandejas" :key="b.clave" class="au__contexto">
            <summary>{{ t.bandejas.length > 1 ? `${b.nombre}: ` : '' }}llegaron <b>{{ b.entraron }}</b> a la bandeja · él {{ b.trabajo }} · otros {{ b.entraron - b.trabajo - b.sinTrabajar }} · pendientes {{ b.sinTrabajar }}</summary>
            <p v-for="o in b.otros" :key="o.nombre" class="au__linea"><b>{{ o.n }}</b> {{ o.nombre }}</p>
            <p v-if="!b.otros.length" class="au__linea">Nadie más trabajó esta bandeja en el rango.</p>
          </details>
        </div>
      </div>

      <div class="card filtros">
        <div class="field" :class="{ 'field--active': filtroModulo }">
          <label>Módulo</label>
          <select v-model="filtroModulo">
            <option value="">Todos</option>
            <option v-for="m in modulos" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div class="field" :class="{ 'field--active': filtroTexto }"><label>Buscar</label><input v-model="filtroTexto" placeholder="Factura, tienda, proveedor…" /></div>
        <button class="btn btn--sm" :disabled="!visibles.length" @click="exportar" style="margin-left:auto" title="Exporta el resumen y los movimientos que se ven (con los filtros)">⬇ Exportar a Excel</button>
      </div>

      <p class="page__hint">{{ visibles.length }} de {{ d.movimientos.length }} movimientos</p>
      <div v-if="visibles.length" class="table-wrap"><table class="grid">
        <thead><tr><th>Fecha y hora</th><th>Módulo</th><th>Acción</th><th>Factura</th><th>Tienda</th><th>Proveedor</th><th class="r">Total (Bs)</th><th>Detalle</th></tr></thead>
        <tbody>
          <tr v-for="(m, i) in visibles" :key="i">
            <td style="white-space:nowrap">{{ fechaHora(m.fecha) }}</td>
            <td>{{ m.modulo }}</td>
            <td style="white-space:nowrap"><span class="badge" :class="claseAccion(m)">{{ m.accion }}</span></td>
            <td>
              <router-link v-if="m.idFlujo" :to="{ path: `/factura/${m.codTienda}/${enc(m.numserie)}/${m.numfactura}/${enc(m.n)}`, query: { soloVista: '1' } }">
                <code>{{ m.numserie }}-{{ m.numfactura }}</code>
              </router-link>
              <span v-else>—</span>
            </td>
            <td>{{ m.marca ? `${m.marca} · ` : '' }}{{ m.tienda || '—' }}</td>
            <td>{{ m.proveedor || '—' }}</td>
            <td class="r">{{ m.total == null ? '—' : money(m.total) }}</td>
            <td class="au__detalle">{{ m.comentario || '' }}</td>
          </tr>
        </tbody>
      </table></div>
      <div v-else class="empty card">Sin movimientos en este rango.</div>
    </template>
    <p v-else class="page__hint">Elige el usuario y el rango, y presiona Consultar.</p>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { descargarExcel } from '../utils/excel';
import { getUsuariosAuditables, getActividad } from '../api/auditoriaUsuarios';
import { money, fecha, fechaHora, hoyVE } from '../utils/format';
import { ROL_LABEL, TAGS_REPORTE } from '../utils/roles';

// Módulos de trabajo: qué permiso los da, qué movimientos cuentan (por "modulo" del backend) y
// qué bandejas (contexto) les corresponden. "unidad": qué número se destaca.
const MODULOS_UI = [
  { clave: 'GASTOS', titulo: 'Gastos (Analista)', rol: 'ANALISTA', modulos: ['Gastos'], bandejas: [], unidad: 'gastos' },
  { clave: 'TESORERIA', titulo: 'Tesorería', rol: 'TESORERIA', modulos: ['Tesorería'], bandejas: ['TESORERIA'], unidad: 'gastos' },
  { clave: 'AUDITORIA', titulo: 'Auditoría', rol: 'AUDITOR', modulos: ['Auditoría', 'Confirmación de pago'], bandejas: ['AUDITORIA', 'CONFIRMACION'], unidad: 'gastos' },
  { clave: 'PAGOS', titulo: 'Pagos', rol: 'PAGADOR', modulos: ['Pagos'], bandejas: ['PAGOS'], unidad: 'gastos' },
  { clave: 'SALDOS', titulo: 'Saldos', rol: 'SALDOS', modulos: ['Saldos'], bandejas: [], unidad: 'movimientos' },
  { clave: 'SOPORTES', titulo: 'Soportes subidos', rol: null, modulos: ['Soportes'], bandejas: [], unidad: 'movimientos' },
];

const usuarios = ref([]);
const buscar = ref('');
const idUsuario = ref('');
const desde = ref(hoyVE());
const hasta = ref(hoyVE());
const d = ref(null);
const cargando = ref(false);
const error = ref('');
const filtroModulo = ref('');
const filtroTexto = ref('');
const enc = encodeURIComponent;

// ── Selector de usuario (combo) ──
const comboInput = ref(null);
const comboAbierto = ref(false);
const resaltado = ref(0);
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const seleccionado = computed(() => usuarios.value.find((u) => u.idUsuario === idUsuario.value) || null);
// Al escribir: los que contienen el texto (sin importar acentos ni mayúsculas); primero el
// exacto, luego los que empiezan así, luego el resto. Con el nombre ya elegido escrito, todos.
const usuariosFiltrados = computed(() => {
  const t = sinAcentos(buscar.value);
  if (!t || (seleccionado.value && buscar.value === seleccionado.value.nombre)) return usuarios.value;
  const rango = (u) => { const n = sinAcentos(u.nombre); return n === t ? 0 : n.startsWith(t) ? 1 : 2; };
  return usuarios.value.filter((u) => sinAcentos(u.nombre).includes(t)).sort((a, b) => rango(a) - rango(b));
});
function abrirCombo() {
  comboAbierto.value = true;
  const i = usuariosFiltrados.value.findIndex((u) => u.idUsuario === idUsuario.value);
  resaltado.value = i >= 0 ? i : 0;
}
function cerrarCombo() {
  comboAbierto.value = false;
  // Si escribió algo que no eligió, vuelve a mostrar el usuario elegido.
  buscar.value = seleccionado.value ? seleccionado.value.nombre : '';
}
function toggleCombo() { if (comboAbierto.value) cerrarCombo(); else { comboInput.value?.focus(); abrirCombo(); } }
function alEscribir() { comboAbierto.value = true; resaltado.value = 0; }
function elegir(u) {
  idUsuario.value = u.idUsuario;
  buscar.value = u.nombre;
  comboAbierto.value = false;
}
function teclaCombo(e) {
  const n = usuariosFiltrados.value.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); if (!comboAbierto.value) abrirCombo(); else resaltado.value = Math.min(n - 1, resaltado.value + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); resaltado.value = Math.max(0, resaltado.value - 1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (comboAbierto.value && usuariosFiltrados.value[resaltado.value]) elegir(usuariosFiltrados.value[resaltado.value]);
    else if (idUsuario.value) consultar();
  } else if (e.key === 'Escape') cerrarCombo();
}
const rangoTexto = computed(() => (d.value.desde === d.value.hasta ? fecha(d.value.desde) : `${fecha(d.value.desde)} al ${fecha(d.value.hasta)}`));
// Permisos a mostrar (sin los sub-permisos de cada reporte, que son muchos).
const permisosVisibles = computed(() => (d.value?.usuario.roles || []).filter((r) => !TAGS_REPORTE.includes(r)));
// Tarjetas: los módulos de sus permisos (todos si es ADMIN), más cualquier módulo donde haya
// hecho algo aunque hoy no tenga el permiso. Soportes solo si subió alguno.
const tarjetas = computed(() => {
  if (!d.value) return [];
  const roles = d.value.usuario.roles;
  const esAdmin = roles.includes('ADMIN');
  return MODULOS_UI.map((m) => {
    const movs = d.value.movimientos.filter((x) => m.modulos.includes(x.modulo));
    const acciones = {};
    for (const x of movs) acciones[x.accion] = (acciones[x.accion] || 0) + 1;
    return {
      ...m,
      porPermiso: m.rol === null || esAdmin || roles.includes(m.rol),
      movimientos: movs.length,
      gastos: new Set(movs.filter((x) => x.idFlujo).map((x) => x.idFlujo)).size,
      acciones: Object.entries(acciones).map(([accion, n]) => ({ accion, n })).sort((a, b) => b.n - a.n),
      bandejas: d.value.bandejas.filter((b) => m.bandejas.includes(b.clave)),
    };
  }).filter((t) => (t.rol === null ? t.movimientos > 0 : (t.porPermiso || t.movimientos > 0)))
    // Primero donde trabajó.
    .sort((a, b) => (b.movimientos > 0) - (a.movimientos > 0));
});
const modulos = computed(() => [...new Set((d.value?.movimientos || []).map((m) => m.modulo))].sort());
const visibles = computed(() => {
  let rows = d.value?.movimientos || [];
  if (filtroModulo.value) rows = rows.filter((m) => m.modulo === filtroModulo.value);
  const t = filtroTexto.value.trim().toLowerCase();
  if (t) rows = rows.filter((m) => [`${m.numserie}-${m.numfactura}`, m.tienda, m.marca, m.proveedor, m.comentario].some((v) => String(v || '').toLowerCase().includes(t)));
  return rows;
});
const claseAccion = (m) => ({ APROBADO: 'badge--green', CONFIRMADO: 'badge--green', PAGO_EN_REVISION: 'badge--purple', DEVUELTO: 'badge--amber', RECHAZADO: 'badge--red' }[m.decision] || 'badge--gray');

async function consultar() {
  if (!idUsuario.value) return;
  cargando.value = true; error.value = ''; d.value = null;
  filtroModulo.value = ''; filtroTexto.value = '';
  try { d.value = await getActividad({ idUsuario: idUsuario.value, desde: desde.value, hasta: hasta.value }); }
  catch (e) { error.value = e.response?.data?.error || e.message; }
  finally { cargando.value = false; }
}

async function exportar() {
  const u = d.value.usuario;
  const generado = `Generado el ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' })}`;
  const cabecera = [
    `Rango: ${rangoTexto.value}   ·   Zonas: ${u.zonas.length ? u.zonas.join(', ') : 'Todas'}`,
    `Permisos: ${permisosVisibles.value.map((r) => ROL_LABEL[r] || r).join(', ') || 'ninguno'}   ·   ${generado}`,
  ];
  // Hoja 1: resumen por módulo (secciones) con lo que hizo y el contexto de cada bandeja.
  const resumen = [
    { concepto: 'Totales', _tipo: 'seccion' },
    { concepto: 'Gastos trabajados', valor: d.value.gastosTrabajados },
    { concepto: 'Movimientos', valor: d.value.movimientos.length },
  ];
  for (const t of tarjetas.value) {
    resumen.push({ concepto: t.titulo + (t.porPermiso ? '' : ' (sin permiso hoy)'), _tipo: 'seccion' });
    resumen.push({ concepto: t.unidad === 'gastos' ? 'Gastos trabajados' : 'Movimientos', valor: t.unidad === 'gastos' ? t.gastos : t.movimientos, _tipo: 'total' });
    for (const a of t.acciones) resumen.push({ concepto: a.accion, valor: a.n, _sangria: true });
    if (!t.acciones.length) resumen.push({ concepto: 'Sin movimientos en este rango', valor: null, _sangria: true });
    for (const b of t.bandejas) {
      const pre = t.bandejas.length > 1 ? `${b.nombre}: ` : '';
      resumen.push({ concepto: `${pre}Llegaron a la bandeja (sus zonas)`, valor: b.entraron, _sangria: true });
      resumen.push({ concepto: `${pre}Los trabajó ${u.nombre}`, valor: b.trabajo, _sangria: true });
      for (const o of b.otros) resumen.push({ concepto: `${pre}Los trabajó ${o.nombre}`, valor: o.n, _sangria: true });
      resumen.push({ concepto: `${pre}Pendientes`, valor: b.sinTrabajar, _sangria: true });
    }
  }
  // Hoja 2: movimientos (lo que se ve en la tabla, con sus filtros).
  const movimientos = visibles.value.map((m) => ({
    fecha: fechaHora(m.fecha).replace(', ', ' '), modulo: m.modulo, accion: m.accion,
    factura: m.idFlujo ? `${m.numserie}-${m.numfactura}` : '', marca: m.marca || '', tienda: m.tienda || '',
    proveedor: m.proveedor || '', total: m.total == null ? null : Number(m.total), detalle: m.comentario || '',
  }));
  const titulo = `Auditoría de usuarios — ${u.nombre}`;
  await descargarExcel(`auditoria_${String(u.nombre || 'usuario').replace(/[^\w]+/g, '_')}_${d.value.desde}_${d.value.hasta}.xlsx`, [
    {
      nombre: 'Resumen', titulo, subtitulo: cabecera,
      columnas: [
        { titulo: 'Concepto', clave: 'concepto', ancho: 62, sangria: true },
        { titulo: 'Cantidad', clave: 'valor', ancho: 14, tipo: 'entero' },
      ],
      filas: resumen, estiloFila: (f) => f._tipo || null,
    },
    {
      nombre: 'Movimientos', titulo, subtitulo: cabecera, filtro: true,
      columnas: [
        { titulo: 'Fecha y hora', clave: 'fecha', ancho: 18 },
        { titulo: 'Módulo', clave: 'modulo', ancho: 20 },
        { titulo: 'Acción', clave: 'accion', ancho: 22 },
        { titulo: 'Factura', clave: 'factura', ancho: 14 },
        { titulo: 'Marca', clave: 'marca', ancho: 14 },
        { titulo: 'Tienda', clave: 'tienda', ancho: 32, ajustar: true },
        { titulo: 'Proveedor', clave: 'proveedor', ancho: 32, ajustar: true },
        { titulo: 'Total (Bs)', clave: 'total', ancho: 16, tipo: 'monto' },
        { titulo: 'Detalle', clave: 'detalle', ancho: 50, ajustar: true },
      ],
      filas: movimientos.length ? movimientos : [{ fecha: 'Sin movimientos en este rango' }],
    },
  ]);
}

onMounted(async () => {
  try { usuarios.value = await getUsuariosAuditables(); } catch (e) { error.value = e.response?.data?.error || e.message; }
});
</script>

<style scoped>
/* Combo de usuario */
.combo { position: relative; }
.combo__input { width: 100%; padding-right: 32px; }
.combo__caret { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #6b7280; cursor: pointer; user-select: none; }
.combo__overlay { position: fixed; inset: 0; z-index: 39; }
.combo__lista { position: absolute; z-index: 40; top: calc(100% + 4px); left: 0; right: 0; max-height: 300px; overflow-y: auto; margin: 0; padding: 6px;
  list-style: none; background: #fff; border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.14); }
.combo__lista li { padding: 7px 10px; border-radius: 6px; font-size: 14px; cursor: pointer; }
.combo__op--activa { background: #f3f4f6; }
.combo__op--sel { font-weight: 700; color: #4f6f17; }
.combo__vacio { color: var(--muted); cursor: default !important; }
.au__resumen { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.au__kpis { display: flex; gap: 24px; align-items: center; }
.au__kpis div { display: flex; flex-direction: column; align-items: flex-end; }
.au__kpis b { font-size: 24px; line-height: 1.1; }
.au__kpis span { font-size: 12px; color: var(--muted); }
.au__bandejas { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; margin-bottom: 20px; }
.au__bandeja { margin: 0; padding: 16px; }
.au__bandeja h4 { margin: 0; font-size: 14px; }
.au__bandeja-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.au__bandeja--activa { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-soft); }
.au__bandeja:not(.au__bandeja--activa) { background: #fafafa; }
.au__grande { margin: 0 0 6px; font-size: 13px; color: #374151; }
.au__grande b { font-size: 24px; margin-right: 4px; color: var(--text); }
.au__vacio { margin: 0; font-size: 13px; color: var(--muted); }
.au__contexto { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border); font-size: 12px; color: #6b7280; }
.au__contexto summary { cursor: pointer; }
.au__sinpermiso { font-size: 11px; color: #92400e; background: #fef3c7; border-radius: 999px; padding: 2px 8px; }
.au__seccion { margin: 0 0 10px; font-size: 15px; }
.au__permisos { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.au__permisos-lbl { font-size: 12px; color: var(--muted); }
.au__linea { margin: 3px 0; font-size: 13px; color: #374151; }
.au__linea b { display: inline-block; min-width: 28px; }
.au__linea--suyo { color: #4f6f17; font-weight: 600; }
.au__linea--pend { color: #92400e; }
.au__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.au__chip { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 4px 12px; font-size: 13px; }
.au__detalle { font-size: 13px; color: #374151; min-width: 200px; }
</style>
