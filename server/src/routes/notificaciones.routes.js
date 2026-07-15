const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { alcanceDe } = require('../services/alcance');
const notificacionesService = require('../services/notificaciones.service');

const router = Router();
router.use(authenticate);

// GET /api/notificaciones/contadores — pendientes por etapa (para los badges del menú).
router.get('/contadores', async (req, res, next) => {
  try {
    const rows = await notificacionesService.contadores();
    // Alcance: si el usuario está limitado, solo cuenta sus zonas.
    const a = await alcanceDe(req.user);
    const m = {};
    for (const x of rows) {
      if (!a.irrestricto && !a.codTiendas.has(x.CodTienda)) continue;
      m[x.Estado] = (m[x.Estado] || 0) + x.n;
    }
    res.json({
      tesoreria: m.PENDIENTE_TESORERIA || 0,
      auditoria: m.PENDIENTE_AUDITORIA || 0,
      pago: m.PENDIENTE_PAGO || 0,
      pagosRevision: m.PAGO_EN_REVISION || 0,
    });
  } catch (e) { next(e); }
});

// GET /api/notificaciones/detalle — pendientes desglosados por tienda (zona/marca/tienda + conteo).
router.get('/detalle', async (req, res, next) => {
  try {
    const out = { tesoreria: [], auditoria: [], pagosRevision: [], pago: [], analista: [], devueltas: [], rechazadas: [] };
    const roles = (req.user && req.user.roles) || [];
    const rows = await notificacionesService.detalle(roles);
    if (!rows.length) return res.json(out);

    const mapa = {
      PENDIENTE_TESORERIA: 'tesoreria',
      PENDIENTE_AUDITORIA: 'auditoria',
      PAGO_EN_REVISION: 'pagosRevision',
      PENDIENTE_PAGO: 'pago',
      PAGADO: 'analista',
      DEVUELTO: 'devueltas',
      RECHAZADO: 'rechazadas',
    };
    // Alcance: si el usuario está limitado, solo sus zonas.
    const a = await alcanceDe(req.user);
    for (const x of rows) {
      if (!a.irrestricto && !a.codTiendas.has(x.CodTienda)) continue;
      const k = mapa[x.Estado];
      if (k) out[k].push({ codTienda: x.CodTienda, zona: x.zona, marca: x.marca, tienda: x.tienda, n: x.n });
    }
    res.json(out);
  } catch (e) { next(e); }
});

// POST /api/notificaciones/limpiar-analista — marca como vistas las PAGADO y RECHAZADO
router.post('/limpiar-analista', async (req, res, next) => {
  try {
    await notificacionesService.limpiarAnalista();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
