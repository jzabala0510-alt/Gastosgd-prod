const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { alcanceDe } = require('../services/alcance');
const jerarquiaService = require('../services/jerarquia.service');

const router = Router();
router.use(authenticate);

// GET /api/jerarquia/zonas
router.get('/zonas', async (req, res, next) => {
  try {
    const rows = await jerarquiaService.zonas();
    // Alcance: si el usuario está limitado, solo sus zonas.
    const a = await alcanceDe(req.user);
    const zonas = a.irrestricto ? rows : rows.filter((z) => a.zonas.has(z.Zona));
    res.json(zonas);
  } catch (e) { next(e); }
});

// GET /api/jerarquia/tiendas?zona=&marca=
router.get('/tiendas', async (req, res, next) => {
  try {
    const rows = await jerarquiaService.tiendas({ zona: req.query.zona, marca: req.query.marca });
    // Alcance: filtra las tiendas fuera de las zonas asignadas al usuario.
    const a = await alcanceDe(req.user);
    const enAlcance = a.irrestricto ? rows : rows.filter((t) => a.codTiendas.has(t.CodTienda));
    res.json(enAlcance);
  } catch (e) { next(e); }
});

// GET /api/jerarquia/marcas?zona=  (marcas presentes en una zona)
router.get('/marcas', async (req, res, next) => {
  try {
    // Alcance: si la zona pedida no está en las zonas del usuario, no hay marcas.
    const a = await alcanceDe(req.user);
    if (!a.irrestricto && req.query.zona && !a.zonas.has(req.query.zona)) return res.json([]);

    const marcas = await jerarquiaService.marcasDeZona({ zona: req.query.zona });
    res.json(marcas);
  } catch (e) { next(e); }
});

module.exports = router;
