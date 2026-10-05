const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'gastosgd-dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

function generarToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// Token del actualizador (sección aparte, clave propia en .env — no roles ICG).
// scope:'updater' lo aisla de los tokens normales: uno no sirve para el otro.
function generarTokenUpdater() {
  return jwt.sign({ scope: 'updater' }, JWT_SECRET, { expiresIn: '2h' });
}

function requireUpdaterAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    if (payload.scope !== 'updater') return res.status(401).json({ error: 'Token invalido' });
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

// Requiere token valido. Coloca el payload en req.user.
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

// True si el usuario tiene alguno de los roles (ADMIN siempre pasa).
// Soporta multi-rol: user.roles es un arreglo; cae a user.rol por compatibilidad.
function tieneRol(user, ...roles) {
  const userRoles = (user && Array.isArray(user.roles) && user.roles.length)
    ? user.roles
    : (user && user.rol ? [user.rol] : []);
  return userRoles.includes('ADMIN') || roles.some((r) => userRoles.includes(r));
}

// Requiere uno de los roles indicados (ADMIN siempre pasa).
function requireRol(...roles) {
  return (req, res, next) => {
    if (tieneRol(req.user, ...roles)) return next();
    res.status(403).json({ error: 'Acceso denegado para tu rol' });
  };
}

module.exports = { generarToken, authenticate, requireRol, tieneRol, generarTokenUpdater, requireUpdaterAuth };
