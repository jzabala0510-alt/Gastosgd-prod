const { Router } = require('express');
const { authenticate, requireRol } = require('../middleware/auth.middleware');
const importarSaldosService = require('../services/importarSaldos.service');

const router = Router();
router.use(authenticate, requireRol('ANALISTA', 'SALDOS'));

// POST /api/fondos/importar-excel/preview
// { fecha, totalExcel?, filas: [{fila, rs1, rs2, bancos:{'EncabezadoRaw': monto}}] }
router.post('/preview', async (req, res, next) => {
  try {
    const { fecha, totalExcel, filas } = req.body || {};
    if (!fecha || !Array.isArray(filas) || !filas.length)
      return res.status(400).json({ error: 'fecha y filas requeridos' });

    const preview = await importarSaldosService.previewImportacion({ fecha, totalExcel, filas });
    res.json(preview);
  } catch (e) { next(e); }
});

module.exports = router;
