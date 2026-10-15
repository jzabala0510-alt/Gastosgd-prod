const { Router } = require('express');
const { generarTokenUpdater, requireUpdaterAuth } = require('../middleware/auth.middleware');
const updaterService = require('../services/updater.service');
const { aplicarPendiente, estadoInstalado } = require('../utils/actualizacionPendiente');

const router = Router();

// POST /api/updater/login  { clave }
router.post('/login', (req, res) => {
  const ip = req.ip;
  if (!updaterService.intentoPermitido(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });
  }
  const { clave } = req.body || {};
  if (!updaterService.verificarClave(clave)) {
    updaterService.registrarIntentoFallido(ip);
    return res.status(401).json({ error: 'Clave incorrecta' });
  }
  updaterService.limpiarIntentos(ip);
  res.json({ token: generarTokenUpdater() });
});

// GET /api/updater/estado — config no sensible, para que la UI confirme de dónde va a tirar,
// y la versión que dejó instalada la última actualización.
router.get('/estado', requireUpdaterAuth, (req, res) => {
  res.json({
    owner: process.env.UPDATE_REPO_OWNER || null,
    repo: process.env.UPDATE_REPO_NAME || null,
    branch: process.env.UPDATE_REPO_BRANCH || 'main',
    ...estadoInstalado(),
  });
});

// POST /api/updater/actualizar — prepara los archivos que cambiaron, responde y recién
// entonces los pone en su lugar (ver utils/actualizacionPendiente.js).
router.post('/actualizar', requireUpdaterAuth, async (req, res, next) => {
  console.log('[updater] solicitud de actualización recibida');
  let plan;
  try {
    plan = await updaterService.prepararActualizacion();
  } catch (e) {
    console.error('[updater] ERROR:', e);
    return next(e);
  }
  const { commit, archivos } = plan;
  if (!archivos.length) return res.json({ ok: true, commit, archivos, mensaje: 'Ya tienes la última versión; no hay nada que actualizar.' });

  // Solo un cambio en server/ obliga a reiniciar: el frontend se sirve tal cual de disco.
  const reinicia = archivos.some((r) => r.startsWith('server/'));
  res.json({ ok: true, commit, archivos, reinicia, mensaje: `Actualizando ${archivos.length} archivo(s)…` });

  // Primero sale la respuesta: al mover el primer archivo de server/, nodemon mata el
  // proceso, y si no termina de moverlos todos, el arranque siguiente completa el resto.
  setTimeout(() => {
    let r;
    try { r = aplicarPendiente(); } catch (e) { r = { error: e.message }; }
    console.log('[updater] aplicado:', JSON.stringify(r));
    // Sin nodemon (NSSM con node a secas) nadie reinicia por los cambios: se sale y NSSM
    // levanta la versión nueva. Con nodemon normalmente ya lo reinició antes de llegar aquí.
    if (reinicia) setTimeout(() => process.exit(0), 1500);
  }, 500);
});

module.exports = router;
