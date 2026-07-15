const { Router } = require('express');
const bancosService = require('../services/bancos.service');

const router = Router();

// GET /api/catalogos/bancos - bancos activos (para cargar saldos por banco)
router.get('/bancos', async (req, res, next) => {
  try {
    const rows = await bancosService.listarActivos();
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
