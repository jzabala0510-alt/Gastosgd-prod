const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPool, getGeneralPool, sql } = require('../config/db');
const { codTiendasDeZonas } = require('./alcance');
const fondosService = require('./fondos.service');
const { hoyVE, horaVE } = require('../utils/fecha');

// Saldo Banesco automático por tienda, vía el API "Consulta de Cuenta" de Banesco.
// Cada tienda tiene su propia credencial en server/banesco.json (gitignored, ver
// banesco.example.json y DEPLOY.md). Se relee en cada uso: editarlo no requiere
// reiniciar el servicio.
const RUTA_CONFIG = path.resolve(__dirname, '..', '..', 'banesco.json');
// Fuera de server/ a propósito: nodemon (producción corre con npm run dev) vigila los .json
// de server/ y, al escribirse este archivo al empezar la corrida automática, reiniciaba el
// backend y la mataba sin grabar nada (y como ya quedaba anotada, no se reintentaba).
const RUTA_ESTADO = path.resolve(__dirname, '..', '..', '..', 'banesco.estado.json');
const TIMEOUT_MS = 30000;

// Saldo en Bs (cuentas nacionales, "Consulta Producto V2") o en $ ("Consulta Moneda
// Extranjera": misma petición en otra ruta y con currency). La de $ devuelve una sola
// cuenta, sin tipo (accountType null), por eso va entera a un banco (bancoUsd).
const CONSULTAS = {
  BS: { paso: 'Saldo Bs', ruta: '/customer/products', extra: {} },
  USD: { paso: 'Saldo USD', ruta: '/me/customer/products', extra: { currency: 'USD' } },
};
const monedaDe = (m) => (String(m || '').toUpperCase() === 'USD' ? 'USD' : 'BS');

function cargarConfig() {
  if (!fs.existsSync(RUTA_CONFIG)) return null;
  try {
    return JSON.parse(fs.readFileSync(RUTA_CONFIG, 'utf8'));
  } catch (e) {
    throw new Error(`banesco.json no es un JSON válido: ${e.message}`);
  }
}
const configurado = (cfg) => !!(cfg && Array.isArray(cfg.empresas) && cfg.empresas.length);

const normRif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// sid fijo por cliente: Banesco lo trata como sesión de dispositivo, y variarlo
// entre llamadas del mismo cliente dio 409/500 en las pruebas.
function sidDe(e) {
  if (e.sid) return e.sid;
  const h = crypto.createHash('sha1').update(String(e.clientId)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function motivo(err) {
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return `Banesco no respondió en ${TIMEOUT_MS / 1000} s`;
  return err.cause ? `${err.message} (${err.cause.code || err.cause.message})` : err.message;
}

// ── Consola: registro de cada petición a Banesco con su respuesta ───────────
// Para mostrarle a Banesco (certificación) qué se envía y qué responde, sin exponer
// secretos: client_secret nunca sale; client_id y tokens salen recortados. Vive en
// memoria (las últimas MAX_TRAZAS): un reinicio del servicio la vacía.
const MAX_TRAZAS = 300;
const trazas = [];
let siguienteTraza = 1;

const recortar = (v) => {
  const s = String(v || '');
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : '••••';
};
const SECRETOS = new Set(['client_secret', 'password']);
const RECORTADOS = new Set(['client_id', 'username', 'fintechid', 'access_token', 'refresh_token', 'id_token']);
// Además de los campos conocidos, cualquier texto que traiga un JWT o la credencial de
// la empresa (p. ej. una respuesta que la repita, o una página de error no-JSON) se tapa.
const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g;
function taparTexto(texto, secretos) {
  let t = String(texto).replace(JWT, (m) => recortar(m));
  for (const sec of secretos) if (sec && String(sec).length >= 4) t = t.split(String(sec)).join('••••');
  return t;
}
function enmascarar(obj, secretos = []) {
  if (Array.isArray(obj)) return obj.map((x) => enmascarar(x, secretos));
  if (typeof obj === 'string') return taparTexto(obj, secretos);
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => {
    const key = k.toLowerCase();
    if (SECRETOS.has(key)) return [k, '••••••••'];
    if (RECORTADOS.has(key)) return [k, recortar(v)];
    if (key === 'authorization') return [k, `Bearer ${recortar(String(v).replace(/^Bearer\s+/i, ''))}`];
    return [k, enmascarar(v, secretos)];
  }));
}

function registrar(t) {
  trazas.push({ id: siguienteTraza++, ...t });
  if (trazas.length > MAX_TRAZAS) trazas.splice(0, trazas.length - MAX_TRAZAS);
}

// ctx = { corrida, origen, empresa, rif } — para agrupar en la consola las peticiones
// de una misma consulta. Cada llamada queda registrada aunque falle. `secretos` (la
// credencial de la empresa) se tapa en todo lo registrado y nunca se guarda.
async function pedir(url, opciones, ctx, paso, secretos = []) {
  const inicio = Date.now();
  let cuerpo = opciones.body;
  if (typeof cuerpo === 'string') {
    try { cuerpo = JSON.parse(cuerpo); } catch { cuerpo = Object.fromEntries(new URLSearchParams(cuerpo)); }
  }
  const traza = {
    ...ctx, paso, hora: new Date().toISOString(), metodo: opciones.method, url,
    headers: enmascarar(opciones.headers || {}, secretos), cuerpo: enmascarar(cuerpo, secretos),
  };
  try {
    const res = await fetch(url, { ...opciones, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* respuesta no-JSON */ }
    registrar({ ...traza, status: res.status, ms: Date.now() - inicio, respuesta: json ? enmascarar(json, secretos) : taparTexto(texto.slice(0, 2000), secretos) });
    return { status: res.status, json };
  } catch (err) {
    registrar({ ...traza, status: null, ms: Date.now() - inicio, error: taparTexto(motivo(err), secretos) });
    throw err;
  }
}

// Token (grant password con username/password = client_id/client_secret, confirmado
// por Banesco; dura 180 s) + validación de que la credencial es de esa empresa.
async function obtenerToken(cfg, e, ctx) {
  const form = new URLSearchParams({
    grant_type: 'password', client_id: e.clientId, client_secret: e.clientSecret,
    username: e.clientId, password: e.clientSecret,
  });
  const tok = await pedir(cfg.ssoUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
  }, ctx, 'Token', [e.clientId, e.clientSecret]);
  const token = tok.json && tok.json.access_token;
  if (!token) {
    const desc = tok.json && tok.json.error_description;
    throw new Error(`Banesco rechazó la credencial (HTTP ${tok.status}${desc ? `: ${desc}` : ''})`);
  }

  // Banesco devuelve las cuentas del RIF atado a la credencial (claims del JWT), no las
  // del RIF del header: si no coinciden, el saldo sería de OTRA empresa (pasó en QA).
  let claims = {};
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { /* claims ilegibles */ }
  // En calidad el RIF viene en idType/idNumber; en producción, en customerReferenceIdType/
  // customerReferenceId. Se usa el primero que traiga.
  const [tipoRif, numRif] = claims.idNumber
    ? [claims.idType, claims.idNumber]
    : [claims.customerReferenceIdType, claims.customerReferenceId];
  if (!numRif) throw new Error('el token de Banesco no trae el RIF (ni idNumber ni customerReferenceId); no se puede validar a qué empresa pertenece');
  const rifToken = `${tipoRif || ''}${numRif}`;
  if (normRif(rifToken) !== normRif(e.rif)) throw new Error(`la credencial está asociada al RIF ${rifToken}, no a ${e.rif}`);
  return token;
}

// Cuentas de la empresa en esa moneda ('BS' o 'USD'), con un token ya validado.
async function consultarSaldo(cfg, e, token, moneda, ctx) {
  const q = CONSULTAS[monedaDe(moneda)];
  const rif = normRif(e.rif);
  const sal = await pedir(`${cfg.saldoBaseUrl}${q.ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      fintechid: e.clientId, idType: rif.slice(0, 1), idNumber: rif.slice(1), username: e.clientId,
    },
    body: JSON.stringify({ dataRequest: { device: { description: 'GastosGD', ipAddress: '0.0.0.0', sid: sidDe(e), type: 'Servidor' }, ...q.extra } }),
  }, ctx, q.paso, [e.clientId, e.clientSecret, token]);
  const cuentas = sal.json && Array.isArray(sal.json.dataResponse) ? sal.json.dataResponse : null;
  if (sal.status !== 200 || !cuentas) {
    const desc = sal.json && sal.json.httpStatus && sal.json.httpStatus.statusDesc;
    throw new Error(`la consulta de saldo ${moneda === 'USD' ? 'en $' : 'en Bs'} falló (HTTP ${sal.status}${desc ? `: ${desc}` : ''})`);
  }
  return cuentas;
}

// Empresas del grupo sin usuario propio: se consultan con la credencial de grupo
// ("grupo" en banesco.json) en "Posición del cliente" (v2), que trae Bs y $ juntos.
// El RIF de la empresa va en customerReference; Banesco devuelve a quién pertenecen las
// cuentas, y si no es esa empresa no se usa nada (mismo criterio que el RIF del token).
const RUTA_POSICION = '/v2/customer/position/evaluate';
async function consultarPosicion(cfg, cred, e, token, ctx) {
  const rifCred = normRif(cred.rif);
  const rif = normRif(e.rif);
  const r = await pedir(`${cfg.saldoBaseUrl}${cfg.rutaPosicion || RUTA_POSICION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      fintechid: cred.clientId, idType: rifCred.slice(0, 1), idNumber: rifCred.slice(1), username: cred.clientId,
    },
    body: JSON.stringify({
      customerPositionState: { customerReference: { customerIdType: rif.slice(0, 1), customerId: rif.slice(1) } },
      device: { deviceType: 'Servidor', deviceDescription: 'GastosGD', deviceIp: '0.0.0.0', deviceSessionReference: sidDe(cred) },
      tokenAssignmentInstance: { tokenIdentificationCode: null },
    }),
  }, ctx, 'Posición Bs y $', [cred.clientId, cred.clientSecret, token]);
  const pos = r.json && r.json.customerPositionState;
  if (r.status !== 200 || !pos || !Array.isArray(pos.bankingProducts)) {
    const msj = r.json && r.json.statusResponse && r.json.statusResponse.message;
    throw new Error(`la consulta de posición falló (HTTP ${r.status}${msj ? `: ${msj}` : ''})`);
  }
  const ref = pos.customerReference || {};
  const rifDevuelto = `${ref.customerIdType || ''}${ref.customerId || ''}`;
  if (normRif(rifDevuelto) !== rif) throw new Error(`Banesco devolvió las cuentas del RIF ${rifDevuelto || '(vacío)'}, no de ${e.rif}`);
  // Mismo formato que la consulta v1 (accountId/accountType/balance) más la moneda. Una
  // moneda que GastosGD no maneja frena la empresa, para no perder ese saldo en silencio.
  return pos.bankingProducts.map((p) => {
    const moneda = monedaDeProducto(p.currency);
    if (!moneda) throw new Error(`la cuenta ${p.productNumber} está en moneda "${String(p.currency || '').trim()}", que GastosGD no maneja`);
    return { accountId: p.productNumber, accountType: p.productType, balance: p.balance, moneda };
  });
}

// "BS " (así llega, con espacio) o VES = bolívares; USD = dólares.
const MONEDAS_BS = new Set(['BS', 'VES', 'VEF', 'BSF', 'BSS', 'BSD']);
function monedaDeProducto(c) {
  const m = String(c || '').trim().toUpperCase().replace(/\./g, '');
  if (MONEDAS_BS.has(m)) return 'BS';
  if (m === 'USD') return 'USD';
  return null;
}

// "modelo": "posicion" en banesco.json = todas las empresas con su propia credencial usan
// la consulta de posición (v2), que trae Bs y $ juntos. Sin él, la de productos (v1).
const modeloPosicion = (cfg) => String(cfg.modelo || '').toLowerCase() === 'posicion';

// Credencial de grupo: "grupo" en banesco.json ({ nombre, rif, clientId, clientSecret, sid }).
const credencialGrupo = (cfg) => (cfg.grupo && cfg.grupo.clientId && cfg.grupo.clientSecret && cfg.grupo.rif ? cfg.grupo : null);
// Para mostrar: "vía credencial de ADIDAS FO SANTIAGO MARIÑO, C.A." (nunca la credencial en sí).
const viaTexto = (cfg, e) => (e.viaGrupo ? ` · vía credencial de ${(cfg.grupo && (cfg.grupo.nombre || cfg.grupo.rif)) || 'grupo'}` : '');

// Cuentas de la empresa en esa moneda. Con usuario propio: su credencial y la consulta de
// esa moneda. Del grupo ("viaGrupo": true): la credencial de grupo y la posición (Bs y $),
// de la que se toman solo las cuentas de esa moneda. `cache` guarda token y posición para
// no repetir consultas cuando se piden ambas monedas en la misma corrida.
async function cuentasDe(cfg, e, moneda, ctx, cache = {}) {
  const mon = monedaDe(moneda);
  if (e.viaGrupo) {
    const cred = credencialGrupo(cfg);
    if (!cred) throw new Error('falta "grupo" (credencial de grupo) en banesco.json');
    if (!cache.posicion) {
      const token = await obtenerToken(cfg, cred, ctx);
      cache.posicion = await consultarPosicion(cfg, cred, e, token, ctx);
    }
    return cache.posicion.filter((c) => c.moneda === mon);
  }
  if (modeloPosicion(cfg)) {
    if (!cache.posicion) {
      const token = await obtenerToken(cfg, e, ctx);
      cache.posicion = await consultarPosicion(cfg, e, e, token, ctx);
    }
    return cache.posicion.filter((c) => c.moneda === mon);
  }
  if (!cache.token) cache.token = await obtenerToken(cfg, e, ctx);
  return consultarSaldo(cfg, e, cache.token, mon, ctx);
}

async function bancosExisten(ids) {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT IdBanco FROM dbo.GD_Banco WHERE IdBanco IN (${ids.join(',')})`);
  return ids.filter((id) => !r.recordset.some((x) => x.IdBanco === id));
}

// Banco (IdBanco de GD_Banco) que recibe cada tipo de cuenta en Bs, según "bancos" en
// banesco.json, ej. { "DDA": 2, "MMK": 15 } (corrientes → BANESCO CORRIENTE, MMK →
// BANESCO DEPOSITO). Por id y no por nombre: renombrar un banco no debe romper esto.
async function bancosPorTipo(cfg) {
  const mapa = cfg.bancos && typeof cfg.bancos === 'object' ? cfg.bancos : {};
  const tipos = Object.keys(mapa);
  if (!tipos.length) throw new Error('Falta "bancos" en banesco.json: qué banco recibe cada tipo de cuenta, ej. { "DDA": 2, "MMK": 15 }.');
  const ids = [...new Set(tipos.map((t) => Number(mapa[t])))];
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) throw new Error('"bancos" en banesco.json debe tener ids de banco (números).');
  const faltan = await bancosExisten(ids);
  if (faltan.length) throw new Error(`"bancos" en banesco.json apunta a bancos que no existen (id ${faltan.join(', ')}).`);
  return Object.fromEntries(tipos.map((t) => [t.toUpperCase(), Number(mapa[t])]));
}

// Banco que recibe el saldo en $ ("bancoUsd" en banesco.json, ej. 2).
async function bancoUsd(cfg) {
  const id = Number(cfg.bancoUsd);
  if (!cfg.bancoUsd) throw new Error('Falta "bancoUsd" en banesco.json: en qué banco va el saldo en $, ej. 2.');
  if (!Number.isInteger(id) || id < 1) throw new Error('"bancoUsd" en banesco.json debe ser un id de banco (número).');
  if ((await bancosExisten([id])).length) throw new Error(`"bancoUsd" en banesco.json apunta a un banco que no existe (id ${id}).`);
  return id;
}

// Saldo por banco: cada banco del mapa arranca en 0 (si la tienda no tiene cuentas de
// ese tipo, su columna queda en 0: Banesco manda). Un tipo de cuenta que no esté en el
// mapa frena la tienda entera, para no perder ese saldo en silencio.
function saldosPorBanco(cuentas, porTipo) {
  const porBanco = Object.fromEntries(Object.values(porTipo).map((id) => [id, 0]));
  for (const c of cuentas) {
    const id = porTipo[String(c.accountType || '').toUpperCase()];
    if (!id) throw new Error(`la cuenta ${c.accountId} es de tipo ${c.accountType}, que no está en "bancos" de banesco.json`);
    porBanco[id] += Number(c.balance) || 0;
  }
  return Object.entries(porBanco).map(([idBanco, monto]) => ({ idBanco: Number(idBanco), monto: Math.round(monto * 100) / 100 }));
}
const saldoUsd = (cuentas, idBanco) => [{
  idBanco, monto: Math.round(cuentas.reduce((a, c) => a + (Number(c.balance) || 0), 0) * 100) / 100,
}];

// Tienda de cada empresa: el codTienda del archivo o, si no lo trae, la única tienda
// cuyo RIF en el ERP (EMPRESASCONTABLES.NIF) coincide. Solo busca en la GENERAL
// principal: las tiendas de fuentes extra (servers-extra.json) necesitan codTienda.
async function asignarTiendas(empresas, cfg = {}) {
  let porNif = new Map();
  if (empresas.some((e) => !e.codTienda)) {
    const gen = await getGeneralPool();
    const r = await gen.request().query("SELECT DISTINCT CODIGO, NIF FROM EMPRESASCONTABLES WHERE ISNULL(LTRIM(RTRIM(NIF)), '') <> ''");
    for (const row of r.recordset) {
      const k = normRif(row.NIF);
      if (!porNif.has(k)) porNif.set(k, new Set());
      porNif.get(k).add(row.CODIGO);
    }
  }
  return empresas.map((e) => {
    const base = { ...e, nombre: e.nombre || e.rif || '(sin nombre)', codTienda: null };
    if (e.viaGrupo && !credencialGrupo(cfg)) return { ...base, problema: 'se consulta por el grupo pero falta "grupo" (credencial de grupo) en banesco.json' };
    if (!e.viaGrupo && (!e.clientId || !e.clientSecret)) return { ...base, problema: 'falta clientId o clientSecret en banesco.json' };
    if (!/^[A-Z]\d{5,}$/.test(normRif(e.rif))) return { ...base, problema: 'RIF inválido en banesco.json (formato J500769300)' };
    if (e.codTienda) return { ...base, codTienda: Number(e.codTienda) };
    const cods = porNif.get(normRif(e.rif));
    if (!cods) return { ...base, problema: 'su RIF no está en el ERP; indica codTienda en banesco.json' };
    if (cods.size > 1) return { ...base, problema: `su RIF corresponde a ${cods.size} tiendas; indica codTienda en banesco.json` };
    return { ...base, codTienda: [...cods][0] };
  });
}

// Para Carga de Saldos: qué tiendas de la zona tienen credencial Banesco, y si el saldo
// en $ está configurado (bancoUsd).
async function estado({ zona }) {
  const cfg = cargarConfig();
  if (!configurado(cfg)) return { configurado: false, usd: false, tiendas: [] };
  const empresas = await asignarTiendas(cfg.empresas, cfg);
  const deZona = await codTiendasDeZonas([zona]);
  return {
    configurado: true, usd: !!cfg.bancoUsd, ambas: modeloPosicion(cfg) && !!cfg.bancoUsd,
    tiendas: empresas.filter((e) => e.codTienda && deZona.has(e.codTienda)).map((e) => e.codTienda),
  };
}

// Una sola consulta a Banesco a la vez (la carga, la automática y la consola): llamadas
// simultáneas del mismo cliente dieron respuestas inconsistentes en las pruebas.
let enCurso = false;
async function exclusivo(fn) {
  if (enCurso) {
    const err = new Error('Ya hay una consulta a Banesco en curso; intenta de nuevo en unos segundos.');
    err.status = 409;
    throw err;
  }
  enCurso = true;
  try { return await fn(); } finally { enCurso = false; }
}
const nuevaCorrida = () => crypto.randomBytes(4).toString('hex');

// Consulta Banesco y graba el saldo de cada tienda (pisa lo que hubiera ese día): Bs en las
// columnas de "bancos", $ en "bancoUsd". Una empresa a la vez. `monedas` = las que se
// graban; con solo `moneda` (el botón de una pestaña) y el modelo de posición, se graban
// las dos, porque llegan en la misma consulta. La primera de la lista es la de la pestaña.
async function sincronizar({ fecha, zona, idUsuario, moneda, monedas, origen = 'Carga de saldos' }) {
  return exclusivo(async () => {
    const cfg = cargarConfig();
    let mons = Array.isArray(monedas) && monedas.length ? [...new Set(monedas.map(monedaDe))] : [monedaDe(moneda)];
    if (!Array.isArray(monedas) && modeloPosicion(cfg) && cfg.bancoUsd) mons = [mons[0], mons[0] === 'BS' ? 'USD' : 'BS'];
    const mon = mons[0];
    if (!configurado(cfg)) return { configurado: false, fecha, moneda: mon, monedas: mons, ok: [], errores: [] };
    const destinos = {};
    for (const m of mons) destinos[m] = m === 'USD' ? await bancoUsd(cfg) : await bancosPorTipo(cfg);
    let empresas = await asignarTiendas(cfg.empresas, cfg);
    if (zona) {
      const deZona = await codTiendasDeZonas([zona]);
      empresas = empresas.filter((e) => e.codTienda && deZona.has(e.codTienda));
    }
    const corrida = nuevaCorrida();
    const ok = [];
    const errores = [];
    for (const e of empresas) {
      if (!e.codTienda) { errores.push({ empresa: e.nombre, codTienda: null, motivo: e.problema }); continue; }
      const ctx = { corrida, origen: `${origen} (${mons.map((m) => (m === 'USD' ? '$' : 'Bs')).join(' y ')})${viaTexto(cfg, e)}`, empresa: e.nombre, rif: e.rif };
      const cache = {};
      const porMoneda = {};
      let cuentasTotal = 0;
      try {
        for (const m of mons) {
          const cuentas = await cuentasDe(cfg, e, m, ctx, cache);
          const saldos = m === 'USD' ? saldoUsd(cuentas, destinos[m]) : saldosPorBanco(cuentas, destinos[m]);
          await fondosService.guardarBulk({ fecha, items: saldos.map((s) => ({ codTienda: e.codTienda, ...s })), idUsuario, moneda: m });
          porMoneda[m] = saldos;
          cuentasTotal += cuentas.length;
        }
        ok.push({ empresa: e.nombre, codTienda: e.codTienda, cuentas: cuentasTotal, saldos: porMoneda[mon] || [], porMoneda });
      } catch (err) {
        errores.push({ empresa: e.nombre, codTienda: e.codTienda, motivo: motivo(err) });
      }
    }
    return { configurado: true, fecha, moneda: mon, monedas: mons, ok, errores };
  });
}

// ── Consola ─────────────────────────────────────────────────────────────────
// Empresas configuradas (sin credenciales) para elegir en la consola.
async function empresasConsola() {
  const cfg = cargarConfig();
  if (!configurado(cfg)) return [];
  return (await asignarTiendas(cfg.empresas, cfg)).map((e, indice) => ({
    indice, nombre: e.nombre, rif: e.rif, codTienda: e.codTienda, viaGrupo: !!e.viaGrupo,
    credencialDe: e.viaGrupo && cfg.grupo ? (cfg.grupo.nombre || cfg.grupo.rif) : null, problema: e.problema || null,
  }));
}

// Consulta de prueba desde la consola: token + saldo en las monedas pedidas, con el
// mismo token (dura 180 s); las del grupo, una sola posición para ambas monedas.
// Solo consulta: no graba saldos.
async function probar({ indice, monedas }) {
  return exclusivo(async () => {
    const cfg = cargarConfig();
    if (!configurado(cfg)) throw new Error('No hay empresas configuradas en banesco.json.');
    const e = cfg.empresas[Number(indice)];
    if (!e) throw new Error('Empresa no encontrada en banesco.json.');
    const empresa = e.nombre || e.rif;
    const ctx = { corrida: nuevaCorrida(), origen: `Consola (prueba, no graba)${viaTexto(cfg, e)}`, empresa, rif: e.rif };
    const desde = siguienteTraza;
    const resultados = [];
    const cache = {};
    for (const m of [...new Set((monedas || ['BS']).map(monedaDe))]) {
      try {
        const cuentas = await cuentasDe(cfg, e, m, ctx, cache);
        resultados.push({ moneda: m, cuentas: cuentas.length, total: Math.round(cuentas.reduce((a, c) => a + (Number(c.balance) || 0), 0) * 100) / 100 });
      } catch (err) {
        resultados.push({ moneda: m, error: motivo(err) });
        if (!cache.token && !cache.posicion) break; // falló antes de traer cuentas: la otra moneda fallaría igual
      }
    }
    return { empresa, resultados, trazas: trazas.filter((t) => t.id >= desde) };
  });
}

const listarTrazas = () => [...trazas].reverse(); // la más reciente primero
const limpiarTrazas = () => { trazas.length = 0; };

// Corrida automática diaria a la hora "horaDiaria" ("HH:MM", hora Venezuela), a nombre
// de "idUsuarioAutomatico" (GD_DispTienda exige un usuario real): Bs y, si "bancoUsd"
// está configurado, también $. La fecha de la última corrida va en banesco.estado.json:
// un reinicio del servicio no la repite, y si el servidor estaba apagado a esa hora,
// corre apenas arranca.
function ultimaCorrida() {
  try { return JSON.parse(fs.readFileSync(RUTA_ESTADO, 'utf8')).ultimaCorridaAutomatica || null; } catch { return null; }
}

async function revisarProgramacion() {
  const cfg = cargarConfig();
  if (!configurado(cfg) || !cfg.horaDiaria) return;
  if (!/^\d{2}:\d{2}$/.test(cfg.horaDiaria)) throw new Error('horaDiaria debe tener formato "HH:MM" (ej. "08:00")');
  const hoy = hoyVE();
  if (horaVE() < cfg.horaDiaria || ultimaCorrida() === hoy || enCurso) return;

  if (!cfg.idUsuarioAutomatico) throw new Error('falta idUsuarioAutomatico en banesco.json; no se corre la actualización automática');
  const idUsuario = Number(cfg.idUsuarioAutomatico);
  const pool = await getPool();
  const u = await pool.request().input('u', sql.Int, idUsuario).query('SELECT TOP 1 1 AS x FROM dbo.GD_Usuario WHERE IdUsuario = @u');
  if (!u.recordset.length) throw new Error(`idUsuarioAutomatico (${cfg.idUsuarioAutomatico}) no existe en GD_Usuario; no se corre la actualización automática`);

  // Se marca antes de correr: si el proceso muere a mitad, no se repite en el día.
  fs.writeFileSync(RUTA_ESTADO, JSON.stringify({ ultimaCorridaAutomatica: hoy }));
  console.log(`[banesco] Actualización automática ${hoy}: iniciada (${cfg.empresas.length} empresa(s))…`);
  const r = await sincronizar({ fecha: hoy, idUsuario, monedas: cfg.bancoUsd ? ['BS', 'USD'] : ['BS'], origen: 'Automática' });
  console.log(`[banesco] Actualización automática ${hoy} (${r.monedas.join(' y ')}): ${r.ok.length} tienda(s) actualizada(s), ${r.errores.length} con error.`);
  for (const e of r.errores) console.error(`[banesco]   ${e.empresa}: ${e.motivo}`);
}

// Se revisa cada minuto; un error de configuración se loguea una sola vez (no 1440 al día).
function iniciarProgramacion() {
  let ultimoError = null;
  setInterval(() => {
    revisarProgramacion()
      .then(() => { ultimoError = null; })
      .catch((e) => {
        if (e.message !== ultimoError) console.error('[banesco]', e.message);
        ultimoError = e.message;
      });
  }, 60 * 1000);
}

module.exports = { estado, sincronizar, revisarProgramacion, iniciarProgramacion, empresasConsola, probar, listarTrazas, limpiarTrazas };
