const { Router } = require('express');
const { authenticate, requireRol } = require('../middleware/auth.middleware');
const tiendaAliasService = require('../services/tiendaAlias.service');

const router = Router();
router.use(authenticate, requireRol('ADMIN')); // solo admin: es infraestructura de Saldos

// POST /api/admin/alias-tiendas/sugerir  { filas: [{fila,zona,marca,rs1,rs2}] }
router.post('/sugerir', async (req, res, next) => {
  try {
    const filas = Array.isArray(req.body?.filas) ? req.body.filas : [];
    if (!filas.length) return res.status(400).json({ error: 'filas requerido' });
    const out = await tiendaAliasService.sugerir(filas);
    res.json(out);
  } catch (e) { next(e); }
});

// POST /api/admin/alias-tiendas/confirmar
//   { decisiones: [{fila,zona,marca,rs1,rs2,estado,score,accion:'CONFIRMAR'|'IGNORAR',codTienda?}] }
router.post('/confirmar', async (req, res, next) => {
  try {
    const decisiones = Array.isArray(req.body?.decisiones) ? req.body.decisiones : [];
    if (!decisiones.length) return res.status(400).json({ error: 'decisiones requerido' });
    const out = await tiendaAliasService.confirmar(decisiones, req.user.idUsuario);
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

// GET /api/admin/alias-tiendas — listado de alias ya decididos.
router.get('/', async (req, res, next) => {
  try {
    const rows = await tiendaAliasService.listar();
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/admin/alias-tiendas/tiendas-erp — universo completo de EMPRESASCONTABLES,
// para el buscador de tiendas (Admin -> Alias de tiendas).
router.get('/tiendas-erp', async (req, res, next) => {
  try {
    const rows = await tiendaAliasService.tiendasErp();
    res.json(rows);
  } catch (e) { next(e); }
});

// PUT /api/admin/alias-tiendas/:id — { codTienda? , estado? } corrige un alias existente.
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 0) return res.status(400).json({ error: 'id inválido' });
    const r = await tiendaAliasService.actualizarAlias(id, { estado: req.body?.estado, codTienda: req.body?.codTienda });
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
