const { Router } = require('express');
const { authenticate, requireRol, requireSuperUsuario } = require('../middleware/auth.middleware');
const { hoyVE } = require('../utils/fecha');
const fondosService = require('../services/fondos.service');
const banescoService = require('../services/banesco.service');
const { zonasDe, alcanceDe } = require('../services/alcance');

const router = Router();
router.use(authenticate);

// Alcance por zona (como en facturas): un usuario limitado a ciertas zonas solo ve y
// carga saldos de esas zonas y de sus tiendas. ADMIN y quien no tiene zonas, todas.
const FUERA_ALCANCE = 'Esa zona está fuera de tu alcance.';
const zonaFueraDeAlcance = (user, zona) => {
  const zonas = zonasDe(user);
  return !!zonas && !zonas.includes(zona);
};

// Espera mínima entre dos "Actualizar Banesco" de la misma zona y moneda: evita que
// clics repetidos disparen consultas seguidas y Banesco bloquee las credenciales.
const ESPERA_BANESCO_MS = 30 * 1000;
const ultimaConsultaBanesco = new Map(); // `${zona}|${moneda}` -> ms

// GET /api/fondos/zona?zona=&fecha=&moneda=BS|USD — tiendas de la zona + saldo cargado en esa fecha y moneda.
router.get('/zona', requireRol('ANALISTA', 'TESORERIA', 'SALDOS'), async (req, res, next) => {
  try {
    const zona = req.query.zona;
    const fecha = req.query.fecha || hoyVE();
    if (!zona) return res.status(400).json({ error: 'zona requerida' });
    if (zonaFueraDeAlcance(req.user, zona)) return res.status(403).json({ error: FUERA_ALCANCE });
    const rows = await fondosService.zonaConSaldos({ zona, fecha, moneda: req.query.moneda });
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/fondos/bulk — { fecha, items:[{codTienda, idBanco, monto}], moneda?: 'BS'|'USD' } guarda el saldo por tienda y banco.
router.post('/bulk', requireRol('ANALISTA', 'SALDOS'), async (req, res, next) => {
  try {
    const { fecha, items, moneda } = req.body || {};
    if (!fecha || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'fecha e items requeridos' });
    const a = await alcanceDe(req.user);
    if (!a.irrestricto && items.some((it) => !a.codTiendas.has(Number(it.codTienda)))) {
      return res.status(403).json({ error: 'Hay tiendas fuera de tu alcance; no se guardó nada.' });
    }
    const n = await fondosService.guardarBulk({ fecha, items, idUsuario: req.user.idUsuario, moneda });
    res.json({ ok: true, guardadas: n });
  } catch (e) { next(e); }
});

// El botón "Actualizar Banesco" y la Consola Banesco son solo para SUPERUSUARIOS (ver
// auth.middleware.js). La corrida automática diaria de Banesco no depende de esto.
// GET /api/fondos/banesco?zona= — tiendas de la zona con credencial Banesco (para mostrar el botón).
router.get('/banesco', requireRol('ANALISTA', 'SALDOS'), requireSuperUsuario, async (req, res, next) => {
  try {
    if (!req.query.zona) return res.status(400).json({ error: 'zona requerida' });
    if (zonaFueraDeAlcance(req.user, req.query.zona)) return res.status(403).json({ error: FUERA_ALCANCE });
    res.json(await banescoService.estado({ zona: req.query.zona }));
  } catch (e) { next(e); }
});

// POST /api/fondos/banesco — { zona, moneda?: 'BS'|'USD' } trae de Banesco el saldo de esas
// tiendas y lo graba en las columnas Banesco. Siempre HOY: el API da el saldo actual, no histórico.
router.post('/banesco', requireRol('ANALISTA', 'SALDOS'), requireSuperUsuario, async (req, res, next) => {
  try {
    const { zona } = req.body || {};
    const moneda = String((req.body || {}).moneda || '').toUpperCase() === 'USD' ? 'USD' : 'BS';
    if (!zona) return res.status(400).json({ error: 'zona requerida' });
    if (zonaFueraDeAlcance(req.user, zona)) return res.status(403).json({ error: FUERA_ALCANCE });
    const clave = `${zona}|${moneda}`;
    const faltan = ESPERA_BANESCO_MS - (Date.now() - (ultimaConsultaBanesco.get(clave) || 0));
    if (faltan > 0) return res.status(429).json({ error: `Banesco se consultó hace poco para esta zona; espera ${Math.ceil(faltan / 1000)} s y vuelve a intentar.` });
    ultimaConsultaBanesco.set(clave, Date.now());
    res.json(await banescoService.sincronizar({ zona, moneda, fecha: hoyVE(), idUsuario: req.user.idUsuario }));
  } catch (e) { next(e); }
});

// ── Consola Banesco (solo SUPERUSUARIOS): peticiones y respuestas, para la certificación ──
// GET /api/fondos/banesco/consola — empresas configuradas (sin credenciales) + registro.
router.get('/banesco/consola', requireSuperUsuario, async (req, res, next) => {
  try {
    res.json({ empresas: await banescoService.empresasConsola(), trazas: banescoService.listarTrazas() });
  } catch (e) { next(e); }
});

// POST /api/fondos/banesco/consola/probar — { indice, monedas: ['BS','USD'] } consulta sin grabar.
router.post('/banesco/consola/probar', requireSuperUsuario, async (req, res, next) => {
  try {
    const { indice, monedas } = req.body || {};
    if (!Number.isInteger(indice) || indice < 0) return res.status(400).json({ error: 'empresa requerida' });
    res.json(await banescoService.probar({ indice, monedas: Array.isArray(monedas) && monedas.length ? monedas : ['BS'] }));
  } catch (e) { next(e); }
});

// DELETE /api/fondos/banesco/consola — vacía el registro.
router.delete('/banesco/consola', requireSuperUsuario, (req, res) => {
  banescoService.limpiarTrazas();
  res.json({ ok: true });
});

module.exports = router;
