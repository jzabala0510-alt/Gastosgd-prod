const { Router } = require('express');
const { authenticate, requireRol } = require('../middleware/auth.middleware');
const usuariosService = require('../services/usuarios.service');
const bancosService = require('../services/bancos.service');

const router = Router();
router.use(authenticate, requireRol('ADMIN')); // todo el módulo es solo para ADMIN

const ROLES = ['ANALISTA', 'TESORERIA', 'AUDITOR', 'PAGADOR', 'PAGADAS', 'SALDOS', 'REPORTES', 'ADMIN'];

// GET /api/admin/usuarios — todos los usuarios ICG (no bloqueados) + sus roles en GastosGD.
router.get('/usuarios', async (req, res, next) => {
  try {
    const out = await usuariosService.listarUsuarios();
    res.json(out);
  } catch (e) { next(e); }
});

// PUT /api/admin/usuarios/:cod — asigna roles (Activo=1) o revoca (sin roles → Activo=0).
// body: { roles: ['ANALISTA','PAGADOR', ...] }
router.put('/usuarios/:cod', async (req, res, next) => {
  try {
    const cod = Number(req.params.cod);
    let roles = (req.body && Array.isArray(req.body.roles)) ? req.body.roles : [];
    roles = [...new Set(roles.map((r) => String(r).trim().toUpperCase()).filter(Boolean))];
    if (!Number.isInteger(cod) || cod < 0) return res.status(400).json({ error: 'codUsuarioIcg inválido' });
    if (roles.some((r) => !ROLES.includes(r))) return res.status(400).json({ error: 'Rol inválido' });

    // Anti-lockout: el admin no puede quitarse a sí mismo el rol ADMIN.
    if (cod === req.user.codUsuarioIcg && !roles.includes('ADMIN')) {
      return res.status(409).json({ error: 'No puedes quitarte tu propio acceso de administrador.' });
    }

    const { activo } = await usuariosService.asignarRoles(cod, roles);
    res.json({ ok: true, codUsuarioIcg: cod, roles: activo ? roles : [], activo });
  } catch (e) { next(e); }
});

// PUT /api/admin/usuarios/:cod/zonas — define el alcance por zona del usuario.
// body: { zonas: ['MARGARITA', ...] }   ·   [] = ve todas las zonas.
router.put('/usuarios/:cod/zonas', async (req, res, next) => {
  try {
    const cod = Number(req.params.cod);
    if (!Number.isInteger(cod) || cod < 0) return res.status(400).json({ error: 'codUsuarioIcg inválido' });
    let zonas = (req.body && Array.isArray(req.body.zonas)) ? req.body.zonas : [];
    zonas = [...new Set(zonas.map((z) => String(z).trim()).filter(Boolean))];

    const r = await usuariosService.asignarZonas(cod, zonas);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true, codUsuarioIcg: cod, zonas });
  } catch (e) { next(e); }
});

// ── Catálogo de bancos (Saldos) ──────────────────────────────────────────

// GET /api/admin/bancos — todos (incl. inactivos), para el panel de administración.
router.get('/bancos', async (req, res, next) => {
  try {
    const rows = await bancosService.listarTodos();
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/admin/bancos — { nombre }
router.post('/bancos', async (req, res, next) => {
  try {
    const nombre = String(req.body?.nombre || '').trim().toUpperCase();
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const banco = await bancosService.crear(nombre);
    res.json({ ok: true, ...banco, activo: true });
  } catch (e) {
    if (e.number === 50001 || /Ya existe un banco/.test(e.message || '')) {
      return res.status(409).json({ error: 'Ya existe un banco con ese nombre' });
    }
    next(e);
  }
});

// PUT /api/admin/bancos/:id — { nombre?, activo? }
router.put('/bancos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 0) return res.status(400).json({ error: 'id inválido' });
    if (req.body?.nombre != null && !String(req.body.nombre).trim()) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }
    const nombre = req.body?.nombre != null ? String(req.body.nombre).trim().toUpperCase() : null;
    await bancosService.actualizar(id, { nombre, activo: req.body?.activo });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
