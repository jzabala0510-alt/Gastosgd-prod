const { Router } = require('express');
const { generarTokenUpdater, requireUpdaterAuth } = require('../middleware/auth.middleware');
const updaterService = require('../services/updater.service');

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

// GET /api/updater/estado — config no sensible, para que la UI confirme de dónde va a tirar.
router.get('/estado', requireUpdaterAuth, (req, res) => {
  res.json({
    owner: process.env.UPDATE_REPO_OWNER || null,
    repo: process.env.UPDATE_REPO_NAME || null,
    branch: process.env.UPDATE_REPO_BRANCH || 'main',
  });
});

// POST /api/updater/actualizar — descarga el .zip del repo, sobreescribe y reinicia.
router.post('/actualizar', requireUpdaterAuth, async (req, res, next) => {
  console.log('[updater] 0/6 solicitud de actualización recibida');
  try {
    const info = await updaterService.descargarYAplicar();
    console.log('[updater] enviando respuesta al navegador');
    res.json({ ok: true, ...info, mensaje: 'Actualización aplicada. El servicio se está reiniciando…' });
    console.log('[updater] respuesta enviada, reiniciando en 800ms');
    // Deja que la respuesta llegue al navegador antes de salir. NSSM (producción) y
    // nodemon (dev, npm run dev) reinician el proceso al detectar que salió.
    setTimeout(() => process.exit(0), 800);
  } catch (e) {
    console.error('[updater] ERROR:', e);
    next(e);
  }
});

module.exports = router;
