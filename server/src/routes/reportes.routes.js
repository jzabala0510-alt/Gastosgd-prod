const { Router } = require('express');
const { authenticate, requireRol } = require('../middleware/auth.middleware');
const { hoyVE } = require('../utils/fecha');
const reportesService = require('../services/reportes.service');

const router = Router();
router.use(authenticate);

// GET /api/reportes?desde=&hasta=&zona=&codTienda=&estado=&soloERP=
router.get('/', requireRol('ANALISTA', 'TESORERIA', 'AUDITOR', 'REPORTES'), async (req, res, next) => {
  try {
    const { desde, hasta, zona, estado, soloERP } = req.query;
    const codTienda = req.query.codTienda ? Number(req.query.codTienda) : null;
    const out = await reportesService.listado({ desde, hasta, zona, codTienda, estado, soloERP });
    res.json(out);
  } catch (e) { next(e); }
});

// GET /api/reportes/saldos?zona=&codTienda=&fecha= — saldos y préstamos por tienda.
router.get('/saldos', requireRol('ANALISTA', 'TESORERIA', 'AUDITOR', 'SALDOS', 'REPORTES'), async (req, res, next) => {
  try {
    const { zona } = req.query;
    const codTienda = req.query.codTienda ? Number(req.query.codTienda) : null;
    const fecha = req.query.fecha || hoyVE();
    const out = await reportesService.saldos({ zona, codTienda, fecha });
    res.json(out);
  } catch (e) { next(e); }
});

module.exports = router;
