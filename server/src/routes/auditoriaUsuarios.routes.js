const { Router } = require('express');
const { authenticate, requireRol } = require('../middleware/auth.middleware');
const actividad = require('../services/actividad.service');

// Auditoría de usuarios: qué hizo cada usuario. Permiso AUDITORIA_USUARIOS (por defecto no lo
// tiene ningún usuario; se asigna en Admin → Usuarios). ADMIN siempre pasa: es quien lo asigna.
const router = Router();
router.use(authenticate, requireRol('AUDITORIA_USUARIOS'));

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const MAX_DIAS = 93;

// GET /api/auditoria-usuarios/usuarios — usuarios con acceso a la app.
router.get('/usuarios', async (req, res, next) => {
  try { res.json(await actividad.usuarios()); } catch (e) { next(e); }
});

// GET /api/auditoria-usuarios?idUsuario=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
router.get('/', async (req, res, next) => {
  try {
    const idUsuario = Number(req.query.idUsuario);
    const { desde, hasta } = req.query;
    if (!idUsuario) return res.status(400).json({ error: 'Elige un usuario.' });
    if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) return res.status(400).json({ error: 'Rango de fechas inválido.' });
    if ((new Date(hasta) - new Date(desde)) / 86400000 > MAX_DIAS) return res.status(400).json({ error: `El rango no puede pasar de ${MAX_DIAS} días.` });
    const out = await actividad.consultar({ idUsuario, desde, hasta });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json(out);
  } catch (e) { next(e); }
});

module.exports = router;
