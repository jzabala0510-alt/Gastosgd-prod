const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate, requireRol } = require('../middleware/auth.middleware');
const { alcanceDe, bloqueadoPorAlcance } = require('../services/alcance');
const { hoyVE } = require('../utils/fecha');
const facturasService = require('../services/facturas.service');
const FUERA_ALCANCE = 'Esta tienda está fuera de tu zona asignada.';

const router = Router();
router.use(authenticate);

// ── Almacenamiento de adjuntos ────────────────────────────────────────
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    cb(null, `fc_${Date.now()}_${base}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// ── GET /api/facturas?codTienda=&estado=  (gastos pendientes por pagar) ─
router.get('/', async (req, res, next) => {
  try {
    const codTienda = Number(req.query.codTienda);
    if (!codTienda) return res.status(400).json({ error: 'codTienda requerido' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    const out = await facturasService.listarPendientes(codTienda, req.query.estado);
    res.json(out);
  } catch (e) { next(e); }
});

// ── POST /api/facturas/marcar-visto — marca como vista por el analista una factura
// en estado final informativo (PAGADO o RECHAZADO). Las DEVUELTO no se marcan aquí. ─
router.post('/marcar-visto', async (req, res, next) => {
  try {
    const { codTienda, numserie, numfactura, n } = req.body || {};
    if (!codTienda || !numserie || !numfactura || !n) return res.status(400).json({ error: 'Faltan parámetros' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    await facturasService.marcarVisto({ codTienda, numserie, numfactura, n });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── GET /api/facturas/pagadas-recientes?codTienda= ────────────────────
// Devuelve las últimas 20 facturas en estado PAGADO para una tienda.
router.get('/pagadas-recientes', async (req, res, next) => {
  try {
    const codTienda = Number(req.query.codTienda);
    if (!codTienda) return res.status(400).json({ error: 'codTienda requerido' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });

    const horas = Math.min(Math.max(Number(req.query.horas) || 72, 1), 720); // 1h–30d, default 48h
    const out = await facturasService.pagadasRecientes(codTienda, horas);
    res.json(out);
  } catch (e) { next(e); }
});

// ── GET /api/facturas/cobertura?codTienda=&fecha= (en Bs) ─────────────
router.get('/cobertura', requireRol('TESORERIA'), async (req, res, next) => {
  try {
    const codTienda = Number(req.query.codTienda);
    const fecha = req.query.fecha || hoyVE();
    if (!codTienda) return res.status(400).json({ error: 'codTienda requerido' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    const out = await facturasService.cobertura(codTienda, fecha);
    res.json(out);
  } catch (e) { next(e); }
});

// ── POST /api/facturas/disponibilidad (Tesorería corrige el total del día) ──
router.post('/disponibilidad', requireRol('TESORERIA'), async (req, res, next) => {
  try {
    const { codTienda, fecha, montoDisponible } = req.body || {};
    if (!codTienda || !fecha || montoDisponible == null) return res.status(400).json({ error: 'Faltan datos' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    await facturasService.guardarAjusteDisponibilidad({ codTienda, fecha, montoDisponible, idUsuario: req.user.idUsuario });
    res.json({ ok: true, disponible: Number(montoDisponible) });
  } catch (e) { next(e); }
});

// ── GET /api/facturas/detalle?codTienda=&numserie=&numfactura=&n= ─────
router.get('/detalle', async (req, res, next) => {
  try {
    const { codTienda, numserie, numfactura, n } = req.query;
    if (!codTienda || !numserie || !numfactura || !n) return res.status(400).json({ error: 'Faltan datos de la factura' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    const out = await facturasService.detalle({ codTienda: Number(codTienda), numserie, numfactura: Number(numfactura), n });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json(out);
  } catch (e) { next(e); }
});

// ── POST /api/facturas/adjuntos (multipart) ──────────────────────────
router.post('/adjuntos', upload.array('archivos', 10), async (req, res, next) => {
  try {
    const { codTienda, numserie, numfactura, n, marca, tipo } = req.body || {};
    if (!codTienda || !numserie || !numfactura || !n) return res.status(400).json({ error: 'Faltan datos de la factura' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No se recibieron archivos' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    const out = await facturasService.guardarAdjuntos({
      codTienda: Number(codTienda), numserie, numfactura: Number(numfactura), n, marca, tipo, files: req.files,
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

// ── DELETE /api/facturas/adjuntos/:id ────────────────────────────────
// Elimina un soporte (fila + archivo físico). Los COMPROBANTE de pago no se borran.
router.delete('/adjuntos/:id', requireRol('ANALISTA', 'TESORERIA', 'AUDITOR'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'IdAdjunto inválido' });
    const out = await facturasService.eliminarAdjunto(id);
    if (out.error) return res.status(out.status).json({ error: out.error });
    if (out.rutaArchivo) fs.unlink(path.join(UPLOAD_DIR, path.basename(out.rutaArchivo)), () => {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Acciones de flujo ────────────────────────────────────────────────
async function ejecutarAccion(req, res, etapa, estadosReq, mapEstado) {
  const { codTienda, numserie, numfactura, n, marca, decision, comentario } = req.body || {};
  if (!codTienda || !numserie || !numfactura || !n) return res.status(400).json({ error: 'Faltan datos de la factura' });
  if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
  const out = await facturasService.accionFactura(etapa, estadosReq, mapEstado, {
    codTienda: Number(codTienda), numserie, numfactura: Number(numfactura), n, marca, decision, comentario,
    idUsuario: req.user.idUsuario,
  });
  if (out.error) return res.status(out.status).json({ error: out.error });
  res.json({ ok: true, estado: out.estado });
}

router.post('/analista', requireRol('ANALISTA'), (req, res, next) =>
  ejecutarAccion(req, res, 'ANALISTA', ['PENDIENTE_ANALISTA', 'DEVUELTO', 'RECHAZADO'],
    { APROBADO: 'PENDIENTE_TESORERIA', DEVUELTO: 'DEVUELTO', RECHAZADO: 'RECHAZADO' }).catch(next));

router.post('/tesoreria', requireRol('TESORERIA'), (req, res, next) =>
  ejecutarAccion(req, res, 'TESORERIA', 'PENDIENTE_TESORERIA',
    { APROBADO: 'PENDIENTE_AUDITORIA', DEVUELTO: 'DEVUELTO', RECHAZADO: 'RECHAZADO' }).catch(next));

router.post('/auditoria', requireRol('AUDITOR'), (req, res, next) =>
  ejecutarAccion(req, res, 'AUDITORIA', 'PENDIENTE_AUDITORIA',
    { APROBADO: 'PENDIENTE_PAGO', DEVUELTO: 'DEVUELTO', RECHAZADO: 'RECHAZADO' }).catch(next));

// Devolver desde Pagos vuelve a Auditoría (la etapa anterior), no al Analista —
// por eso no reutiliza el estado compartido DEVUELTO. Requiere el permiso aparte
// PAGOS_DEVOLVER (no todo el que ve Pagos puede devolver).
router.post('/pagos-devolver', requireRol('PAGOS_DEVOLVER'), (req, res, next) =>
  ejecutarAccion(req, res, 'PAGADOR', 'PENDIENTE_PAGO',
    { DEVUELTO: 'PENDIENTE_AUDITORIA' }).catch(next));

// ── POST /api/facturas/pagar (multipart, PAGADOR) ─────────────────────
// Requiere al menos 1 archivo (comprobante obligatorio).
router.post('/pagar', requireRol('PAGADOR'), upload.array('archivos', 10), async (req, res, next) => {
  try {
    const { codTienda, numserie, numfactura, n, marca } = req.body || {};
    if (!codTienda || !numserie || !numfactura || !n) return res.status(400).json({ error: 'Faltan datos de la factura' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'El comprobante de pago es obligatorio' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    const out = await facturasService.pagar({
      codTienda: Number(codTienda), numserie, numfactura: Number(numfactura), n, marca,
      idUsuario: req.user.idUsuario, files: req.files,
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

// ── POST /api/facturas/confirmar-pago (AUDITOR) ──────────────────────
router.post('/confirmar-pago', requireRol('AUDITOR'), async (req, res, next) => {
  try {
    const { codTienda, numserie, numfactura, n, marca, decision, comentario } = req.body || {};
    if (!codTienda || !numserie || !numfactura || !n) return res.status(400).json({ error: 'Faltan datos de la factura' });
    if (!['CONFIRMADO', 'DEVUELTO'].includes(decision)) return res.status(400).json({ error: 'Decisión inválida (CONFIRMADO o DEVUELTO)' });
    if (await bloqueadoPorAlcance(req.user, codTienda)) return res.status(403).json({ error: FUERA_ALCANCE });
    const out = await facturasService.confirmarPago({
      codTienda: Number(codTienda), numserie, numfactura: Number(numfactura), n, marca, decision, comentario,
      idUsuario: req.user.idUsuario,
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    res.json({ ok: true, estado: out.estado });
  } catch (e) { next(e); }
});

// ── GET /api/facturas/bandeja?estado= (cross-tienda, desde el overlay) ─
router.get('/bandeja', async (req, res, next) => {
  try {
    const estado = req.query.estado || 'PENDIENTE_AUDITORIA';
    const alcance = await alcanceDe(req.user);
    const out = await facturasService.bandeja(estado, alcance);
    res.json(out);
  } catch (e) { next(e); }
});

module.exports = router;
