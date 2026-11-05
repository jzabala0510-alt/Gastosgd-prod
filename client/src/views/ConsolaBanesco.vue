<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Consola Banesco</h1>
        <p class="page__hint">Cada petición al API de Banesco con su respuesta: las de esta consola, las de "Actualizar Banesco" en Carga de Saldos y las de la corrida automática. El client_secret nunca se muestra; client_id y tokens salen recortados.</p>
      </div>
      <router-link to="/fondos" class="btn btn--sm">← Carga de Saldos</router-link>
    </div>

    <div class="card filtros">
      <div class="field" style="flex:2" :class="{ 'field--active': indice !== '' }">
        <label>Empresa</label>
        <select v-model="indice" :disabled="busy">
          <option value="">Selecciona empresa…</option>
          <option v-for="e in empresas" :key="e.indice" :value="e.indice">{{ e.nombre }} — {{ e.rif }}{{ e.codTienda ? ` (tienda ${e.codTienda})` : '' }}{{ e.viaGrupo ? ` · vía credencial de ${e.credencialDe || 'grupo'}` : '' }}</option>
        </select>
      </div>
      <div class="consola__acciones">
        <button class="btn btn--primary" :disabled="busy || indice === ''" @click="probar(['BS'])">Consultar Bs</button>
        <button class="btn btn--primary" :disabled="busy || indice === ''" @click="probar(['USD'])">Consultar $</button>
        <button class="btn btn--primary" :disabled="busy || indice === ''" @click="probar(['BS', 'USD'])">Consultar Bs y $</button>
      </div>
    </div>
    <p v-if="!empresas.length && !cargando" class="soporte-aviso">No hay empresas configuradas en <code>server/banesco.json</code>.</p>
    <p class="page__hint consola__nota">Las consultas de esta consola no graban saldos: solo muestran lo que responde Banesco.</p>

    <div v-if="busy" class="cargando">
      <span class="spinner"></span>
      <div class="cargando__text"><b>Consultando Banesco…</b><span>Token y luego el saldo de cada moneda; las empresas del grupo, una sola consulta de posición con Bs y $.</span></div>
    </div>
    <p v-if="error" class="soporte-aviso">⚠ {{ error }}</p>
    <div v-if="ultimo" class="consola__resultado" :class="{ 'consola__resultado--error': ultimo.resultados.some((r) => r.error) }">
      <b>{{ ultimo.empresa }}:</b>
      <span v-for="(r, i) in ultimo.resultados" :key="i">
        <template v-if="r.error">{{ r.moneda ? `${simbolo(r.moneda)}: ` : '' }}{{ r.error }}</template>
        <template v-else>{{ simbolo(r.moneda) }} {{ money(r.total) }} ({{ r.cuentas }} cuenta{{ r.cuentas === 1 ? '' : 's' }})</template>
      </span>
    </div>

    <div class="consola__barra">
      <span><b>{{ trazas.length }}</b> petición(es) registradas</span>
      <label class="consola__vivo"><input type="checkbox" v-model="enVivo" /> En vivo (cada 3 s)</label>
      <button class="btn btn--sm" :disabled="busy" @click="cargar">Actualizar</button>
      <button class="btn btn--sm" :disabled="!trazas.length" @click="descargar">⬇ Descargar JSON</button>
      <button class="btn btn--sm" :disabled="busy || !trazas.length" @click="limpiar">Limpiar</button>
    </div>

    <div v-if="!trazas.length && !cargando" class="empty card">Todavía no hay peticiones registradas. Elige una empresa y consulta.</div>

    <div v-for="g in grupos" :key="g.corrida" class="consola__grupo card">
      <div class="consola__grupo-head">
        <b>{{ g.empresa }}</b> <span class="consola__rif">{{ g.rif }}</span>
        <span class="badge badge--gray">{{ g.origen }}</span>
        <span class="consola__hora">{{ hora(g.hora) }}</span>
      </div>
      <div v-for="t in g.trazas" :key="t.id" class="consola__traza">
        <button type="button" class="consola__linea" @click="toggle(t.id)">
          <span class="consola__status" :class="claseStatus(t)">{{ t.status ?? 'ERROR' }}</span>
          <span class="consola__paso">{{ t.paso }}</span>
          <code class="consola__url">{{ t.metodo }} {{ ruta(t.url) }}</code>
          <span class="consola__ms">{{ t.ms }} ms</span>
          <span class="consola__caret">{{ abiertas.has(t.id) ? '▾' : '▸' }}</span>
        </button>
        <div v-if="abiertas.has(t.id)" class="consola__detalle">
          <div class="consola__bloque">
            <div class="consola__bloque-head">Request <button type="button" class="consola__copiar" @click="copiar(request(t))">Copiar</button></div>
            <pre>{{ request(t) }}</pre>
          </div>
          <div class="consola__bloque">
            <div class="consola__bloque-head">Response <button type="button" class="consola__copiar" @click="copiar(response(t))">Copiar</button></div>
            <pre>{{ response(t) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { getConsolaBanesco, probarBanesco, limpiarConsolaBanesco } from '../api/fondos';
import { money, hoyVE } from '../utils/format';

const empresas = ref([]);
const trazas = ref([]); // la más reciente primero
const indice = ref('');
const busy = ref(false);
const cargando = ref(false);
const error = ref('');
const ultimo = ref(null); // resultado de la última consulta de esta consola
const abiertas = ref(new Set());
const enVivo = ref(false);
let timer = null;

const simbolo = (m) => (m === 'USD' ? '$' : 'Bs');
const hora = (iso) => new Date(iso).toLocaleTimeString('es-VE');
const ruta = (url) => String(url).replace(/^https?:\/\/[^/]+/, '');
const claseStatus = (t) => (t.status >= 200 && t.status < 300 ? 'ok' : 'mal');
const json = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const request = (t) => `${t.metodo} ${t.url}\n\nHeaders:\n${json(t.headers)}\n\nBody:\n${json(t.cuerpo)}`;
const response = (t) => (t.error ? `Sin respuesta: ${t.error}` : `HTTP ${t.status} · ${t.ms} ms\n\n${json(t.respuesta)}`);

// Peticiones de una misma consulta juntas (token + saldos), en el orden en que salieron.
const grupos = computed(() => {
  const out = [];
  for (const t of trazas.value) {
    let g = out[out.length - 1];
    if (!g || g.corrida !== t.corrida) {
      g = { corrida: t.corrida, empresa: t.empresa, rif: t.rif, origen: t.origen, hora: t.hora, trazas: [] };
      out.push(g);
    }
    g.trazas.unshift(t);
    g.hora = t.hora;
  }
  return out;
});

function toggle(id) {
  const s = new Set(abiertas.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  abiertas.value = s;
}

async function cargar() {
  cargando.value = true;
  try {
    const r = await getConsolaBanesco();
    empresas.value = r.empresas;
    trazas.value = r.trazas;
  } catch (e) {
    error.value = e.response?.data?.error || 'No se pudo cargar la consola.';
  } finally { cargando.value = false; }
}

async function probar(monedas) {
  busy.value = true;
  error.value = '';
  ultimo.value = null;
  try {
    const r = await probarBanesco(Number(indice.value), monedas);
    ultimo.value = r;
    await cargar();
    abiertas.value = new Set(r.trazas.map((t) => t.id)); // lo recién consultado, abierto
  } catch (e) {
    error.value = e.response?.data?.error || 'No se pudo consultar Banesco.';
  } finally { busy.value = false; }
}

async function limpiar() {
  await limpiarConsolaBanesco();
  ultimo.value = null;
  abiertas.value = new Set();
  await cargar();
}

function descargar() {
  const blob = new Blob([JSON.stringify([...trazas.value].reverse(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `consola-banesco-${hoyVE()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); } catch { /* sin permiso de portapapeles */ }
}

watch(enVivo, (v) => {
  clearInterval(timer);
  if (v) timer = setInterval(() => { if (!busy.value) cargar(); }, 3000);
});
onMounted(cargar);
onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped>
.consola__acciones { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.consola__nota { margin: -6px 0 14px; }
.consola__resultado { margin-bottom: 14px; padding: 10px 14px; border-radius: 7px; font-size: 14px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; display: flex; flex-wrap: wrap; gap: 6px 16px; }
.consola__resultado--error { background: #fef3c7; border-color: #fbbf24; color: #92400e; }
.consola__barra { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; font-size: 14px; }
.consola__barra > span { margin-right: auto; }
.consola__vivo { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.consola__grupo { padding: 12px 14px; margin-bottom: 12px; }
.consola__grupo-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; font-size: 14px; }
.consola__rif { color: #6b7280; font-size: 13px; }
.consola__hora { margin-left: auto; color: #6b7280; font-size: 13px; }
.consola__traza { border-top: 1px solid var(--border); }
.consola__linea { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 4px; border: none; background: none; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.consola__linea:hover { background: #f9fafb; }
.consola__status { min-width: 52px; padding: 2px 8px; border-radius: 999px; text-align: center; font-weight: 700; font-size: 12px; }
.consola__status.ok { background: #dcfce7; color: #166534; }
.consola__status.mal { background: #fee2e2; color: #991b1b; }
.consola__paso { min-width: 72px; font-weight: 600; }
.consola__url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #374151; }
.consola__ms { color: #6b7280; white-space: nowrap; }
.consola__caret { color: #6b7280; }
.consola__detalle { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 4px 0 12px; }
@media (max-width: 900px) { .consola__detalle { grid-template-columns: 1fr; } }
.consola__bloque { min-width: 0; }
.consola__bloque-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; margin-bottom: 4px; }
.consola__copiar { border: 1px solid var(--border); background: #fff; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; text-transform: none; letter-spacing: 0; }
.consola__bloque pre { margin: 0; padding: 10px 12px; max-height: 380px; overflow: auto; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-all; }
</style>
