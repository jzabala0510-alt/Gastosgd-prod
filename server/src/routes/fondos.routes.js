const { Router } = require('express');
const { authenticate, requireRol } = require('../middleware/auth.middleware');
const { hoyVE } = require('../utils/fecha');
const fondosService = require('../services/fondos.service');

const router = Router();
router.use(authenticate);

// GET /api/fondos/zona?zona=&fecha= — tiendas de la zona + saldo cargado en esa fecha.
router.get('/zona', requireRol('ANALISTA', 'TESORERIA', 'SALDOS'), async (req, res, next) => {
  try {
    const zona = req.query.zona;
    const fecha = req.query.fecha || hoyVE();
    if (!zona) return res.status(400).json({ error: 'zona requerida' });
    const rows = await fondosService.zonaConSaldos({ zona, fecha });
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/fondos/bulk — { fecha, items:[{codTienda, idBanco, monto}] } guarda el saldo por tienda y banco.
router.post('/bulk', requireRol('ANALISTA', 'SALDOS'), async (req, res, next) => {
  try {
    const { fecha, items } = req.body || {};
    if (!fecha || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'fecha e items requeridos' });
    const n = await fondosService.guardarBulk({ fecha, items, idUsuario: req.user.idUsuario });
    res.json({ ok: true, guardadas: n });
  } catch (e) { next(e); }
});

module.exports = router;
