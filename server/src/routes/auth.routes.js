const { Router } = require('express');
const { encriptar } = require('../auth/icgCrypto');
const { generarToken, authenticate } = require('../middleware/auth.middleware');
const authService = require('../services/auth.service');

const router = Router();

// POST /api/auth/login  { password }
// 1) busca en GENERAL.USUARIOS quien tiene esa contrasena (NEWPASS cifrado)
// 2) resuelve el/los rol(es) GastosGD del usuario en GD_Usuario (Rol = CSV)
router.post('/login', async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'Contrasena requerida' });
    }

    // 1) Usuarios ICG (activos) cuya contrasena coincide
    const passEnc = encriptar(password);
    const usuariosIcg = await authService.buscarPorClave(passEnc);

    if (!usuariosIcg.length) {
      return res.status(401).json({ error: 'Contrasena incorrecta' });
    }

    // 2) De esos, cual tiene rol activo en GastosGD (evita depender del usuario)
    const gastosGD = await authService.usuariosGastosGDActivos();
    const codigosIcg = usuariosIcg.map((r) => r.CODUSUARIO);
    const candidatos = gastosGD.filter((g) => codigosIcg.includes(g.CodUsuarioIcg));

    if (!candidatos.length) {
      return res.status(403).json({ error: 'No tienes un rol asignado en GastosGD. Contacta al administrador.' });
    }
    if (candidatos.length > 1) {
      return res.status(409).json({ error: 'La contrasena coincide con mas de un usuario. Contacta al administrador.' });
    }
    const g = candidatos[0];
    const icg = usuariosIcg.find((r) => r.CODUSUARIO === g.CodUsuarioIcg);

    // Ámbito del usuario. Sin filas = sin restricción.
    //   CodAlmacen → tiendas (compat)   ·   Zona → alcance por zona
    const amb = await authService.ambitoDeUsuario(g.IdUsuario);
    const tiendas = amb.filter((r) => r.CodAlmacen != null).map((r) => r.CodAlmacen);
    const zonas = [...new Set(amb
      .map((r) => (r.Zona || '').trim()).filter(Boolean))];

    // Rol puede traer varios roles separados por coma (multi-rol).
    const roles = String(g.Rol || '').split(',').map((s) => s.trim()).filter(Boolean);

    const payload = {
      idUsuario: g.IdUsuario,
      codUsuarioIcg: icg.CODUSUARIO,
      usuario: icg.USUARIO,
      nombre: g.Nombre || icg.USUARIO,
      roles,
      rol: roles[0] || '', // compat con código que lea un solo rol
      tiendas,
      zonas,
    };

    res.json({ token: generarToken(payload), ...payload });
  } catch (err) { next(err); }
});

// GET /api/auth/me - datos del usuario autenticado (desde el token)
router.get('/me', authenticate, (req, res) => {
  const { idUsuario, codUsuarioIcg, usuario, nombre, roles, rol, tiendas, zonas } = req.user;
  res.json({ idUsuario, codUsuarioIcg, usuario, nombre, roles: roles || (rol ? [rol] : []), rol, tiendas, zonas: zonas || [] });
});

module.exports = router;
