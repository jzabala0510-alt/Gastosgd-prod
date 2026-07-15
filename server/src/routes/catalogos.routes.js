const { Router } = require('express');
const catalogosService = require('../services/catalogos.service');
const bancosService = require('../services/bancos.service');

const router = Router();

// GET /api/catalogos/tiendas[?soloVenta=1] - jerarquia completa via GD_vw_Tienda
router.get('/tiendas', async (req, res, next) => {
  try {
    const rows = await catalogosService.tiendas(req.query.soloVenta === '1');
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/catalogos/zonas - provincias distintas
router.get('/zonas', async (req, res, next) => {
  try {
    const rows = await catalogosService.zonas();
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/catalogos/marcas
router.get('/marcas', async (req, res, next) => {
  try {
    const rows = await catalogosService.marcas();
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/catalogos/monedas - via GD_vw_Moneda
router.get('/monedas', async (req, res, next) => {
  try {
    const rows = await catalogosService.monedas();
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/catalogos/categorias - categorias de gasto activas
router.get('/categorias', async (req, res, next) => {
  try {
    const rows = await catalogosService.categorias();
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/catalogos/bancos - bancos activos (para cargar saldos por banco)
router.get('/bancos', async (req, res, next) => {
  try {
    const rows = await bancosService.listarActivos();
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
