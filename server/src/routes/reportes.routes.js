const { Router } = require('express');
const { authenticate, tieneRol } = require('../middleware/auth.middleware');
const { hoyVE } = require('../utils/fecha');
const reportesService = require('../services/reportes.service');
const { esReporte, puedeVerReporte, filtrosDeReporte } = require('../services/catalogoReportes');

const router = Router();
router.use(authenticate);

const SIN_PERMISO_REPORTE = 'No tienes permiso para ver este reporte.';

// GET /api/reportes?tipo=&zona=&codTienda=&desde=&hasta=&estado=
//   Con tipo: un reporte de Reportería; permiso por reporte y filtros armados en el
//   servidor (ver catalogoReportes.js), no los que mande el navegador.
//   Sin tipo: el listado completo que usa Archivo (permiso ARCHIVO).
router.get('/', async (req, res, next) => {
  try {
    const { tipo } = req.query;
    let filtros;
    if (tipo) {
      if (!esReporte(tipo) || tipo === 'saldos') return res.status(400).json({ error: 'Tipo de reporte inválido.' });
      if (!puedeVerReporte(req.user, tipo)) return res.status(403).json({ error: SIN_PERMISO_REPORTE });
      filtros = filtrosDeReporte(tipo, req.query);
    } else {
      if (!tieneRol(req.user, 'ARCHIVO')) return res.status(403).json({ error: 'Acceso denegado para tu rol' });
      filtros = { zona: req.query.zona || undefined, codTienda: req.query.codTienda ? Number(req.query.codTienda) : null };
    }
    res.json(await reportesService.listado(filtros));
  } catch (e) { next(e); }
});

// GET /api/reportes/saldos?zona=&codTienda=&fecha= — reporte "General de saldos".
router.get('/saldos', async (req, res, next) => {
  try {
    if (!puedeVerReporte(req.user, 'saldos')) return res.status(403).json({ error: SIN_PERMISO_REPORTE });
    const { zona } = req.query;
    const codTienda = req.query.codTienda ? Number(req.query.codTienda) : null;
    const fecha = req.query.fecha || hoyVE();
    res.json(await reportesService.saldos({ zona, codTienda, fecha }));
  } catch (e) { next(e); }
});

module.exports = router;
