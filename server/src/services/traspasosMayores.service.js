const { sql, getPool } = require('../config/db');
const { resolverTienda } = require('./marca');
const { tiposDocumentoCompra, sqlTipos } = require('./facturasCompra.service');

// Gastos de mayores transferidos a las tiendas (fase 3 del seguimiento de ICG).
//
// En ICG, un gasto que paga mayores (TOP GROUP / MAYORES) se registra también en la tienda a
// la que se le transfiere: misma factura del proveedor, en las dos BD. Si las dos pasan por el
// flujo de GastosGD, el gasto queda pagado dos veces. La oficial es la de la tienda.
//
// Emparejamiento (validado en la investigación de nov-2026): mismo RIF del proveedor
// (sin guiones ni espacios) + mismo número de factura del proveedor (SUFACTURA) + mismo
// monto (±0,01) + fechas a no más de MARGEN_DIAS días.
//
// Qué se hace con la de mayores:
//   TRANSFERIR  la de la tienda ya está en el flujo → la de mayores pasa a TRANSFERIDO (sale
//               de las bandejas), incluso si ya estaba PAGADO.
//   ETIQUETA    la de la tienda aún no entra al flujo → la de mayores sigue su flujo, con la
//               etiqueta "Transferido en ICG a …" para que se vea.
//   AMBIGUO     hay más de una pareja posible → no se toca, se revisa a mano.
// Del lado de la tienda, su factura lleva la etiqueta "Ya pagado por mayores · …" (o "También
// en mayores") para que no se envíe ni se pague dos veces: sale de IcgTransferidoA de la de
// mayores (mapaMayores), sin guardar nada en la fila de la tienda.
// Con SEGUIMIENTO_ICG_TRANSFERIDOS=aplicar en el .env se aplica; si no, solo se simula
// (se detecta y se lista en Admin → Seguimiento ICG, sin cambiar nada).

const MARCAS_MAYORES = ['TOP GROUP', 'MAYORES'];
const DIAS = 180;        // facturas de mayores de los últimos DIAS días
const MARGEN_DIAS = 60;  // diferencia máxima de fecha entre la de mayores y la de la tienda
const FUERA_DEL_FLUJO = ['PENDIENTE_ANALISTA', 'RECHAZADO', 'TRANSFERIDO'];
const enFlujo = (estado) => !!estado && !FUERA_DEL_FLUJO.includes(estado);

const ESTADO_TXT = {
  PENDIENTE_ANALISTA: 'Pendiente Analista', PENDIENTE_TESORERIA: 'Pendiente Tesorería', PENDIENTE_AUDITORIA: 'Pendiente Auditoría',
  PENDIENTE_PAGO: 'Pendiente de Pago', PAGO_EN_REVISION: 'Pago en Revisión', PAGADO: 'Pagado', APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado', DEVUELTO: 'Devuelto', TRANSFERIDO: 'Transferido',
};
const estadoTxt = (e) => ESTADO_TXT[e] || e || 'sin entrar al flujo';

const modo = () => (String(process.env.SEGUIMIENTO_ICG_TRANSFERIDOS || '').trim().toLowerCase() === 'aplicar' ? 'aplicar' : 'simular');

const rif = (s) => String(s || '').toUpperCase().replace(/[-\s]/g, '');
const suFactura = (s) => String(s || '').trim().toUpperCase();
const k3 = (serie, num, n) => `${String(serie).trim()}|${num}|${String(n).trim()}`;

// Lo que se guarda en GD_FacturaFlujo.IcgTransferidoA: la factura de la tienda. Al pasar a
// TRANSFERIDO se agrega en qué estado estaba la de mayores (para avisar en la tienda si
// mayores ya lo había pagado).
const destinoJson = (g, extra = {}) => JSON.stringify({
  codTienda: g.codTienda, tienda: g.tienda, marca: g.marca, numserie: g.numserie, numfactura: g.numfactura, n: g.n, ...extra,
});
function leerDestino(txt) {
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

// BD de marca a partir de las tiendas con gastos en el flujo, con sus filas de flujo por
// clave. mayores = la BD es de TOP GROUP / MAYORES.
async function bdsDelFlujo() {
  const app = await getPool();
  const fl = await app.request().query(
    'SELECT IdFlujo, CodTienda, Marca, NumSerie, NumFactura, N, Estado, IcgTransferidoA FROM dbo.GD_FacturaFlujo');
  const porTienda = new Map();
  for (const x of fl.recordset) {
    if (!porTienda.has(x.CodTienda)) porTienda.set(x.CodTienda, []);
    porTienda.get(x.CodTienda).push(x);
  }
  const porBd = new Map();
  const errores = [];
  const tiendas = new Map(); // codTienda -> { tienda, marca }
  for (const [cod, filas] of porTienda) {
    let info;
    try { info = await resolverTienda(cod); } catch (e) { info = { error: true, mensaje: e.message }; }
    if (info.tienda) tiendas.set(cod, { tienda: info.tienda.Tienda, marca: String(info.tienda.Marca || '').trim() });
    if (info.error) {
      const bd = info.dbName || `tienda ${cod}`;
      const deTienda = !(info.tienda && MARCAS_MAYORES.includes(String(info.tienda.Marca || '').trim()));
      if (!errores.some((e) => e.bd === bd)) errores.push({ bd, mensaje: info.mensaje, deTienda });
      continue;
    }
    const bk = `${info.host}|${info.dbName}`;
    if (!porBd.has(bk)) porBd.set(bk, { bk, info, flujos: new Map(), mayores: false });
    const g = porBd.get(bk);
    if (MARCAS_MAYORES.includes(String(info.tienda.Marca || '').trim())) g.mayores = true;
    for (const x of filas) g.flujos.set(k3(x.NumSerie, x.NumFactura, x.N), x);
  }
  return { porBd, errores, tiendas };
}

// Nombre y marca de una tienda (para las facturas que no están en el flujo).
async function datosTienda(tiendas, cod) {
  if (!tiendas.has(cod)) {
    try {
      const info = await resolverTienda(cod);
      tiendas.set(cod, info.tienda ? { tienda: info.tienda.Tienda, marca: String(info.tienda.Marca || '').trim() } : { tienda: null, marca: null });
    } catch { tiendas.set(cod, { tienda: null, marca: null }); }
  }
  return tiendas.get(cod);
}

// Facturas de gastos de una BD de mayores de los últimos DIAS días, con si siguen
// pendientes en ICG.
async function facturasMayores(g) {
  const tipos = await tiposDocumentoCompra(g.info.pool, g.bk);
  const pendiente = tipos.length
    ? `CASE WHEN EXISTS (SELECT 1 FROM TESORERIA t WHERE t.ORIGEN = 'P' AND t.TIPODOCUMENTO IN (${sqlTipos(tipos)})
         AND t.SERIE = f.NUMSERIE AND t.NUMERO = f.NUMFACTURA AND t.N = f.N AND t.ESTADO = 'P' AND ABS(t.IMPORTE) > 0.10)
       THEN 1 ELSE 0 END`
    : '0';
  const r = await g.info.pool.request().query(`
    SELECT f.NUMSERIE, f.NUMFACTURA, f.N, f.FECHA, f.SUFACTURA, f.TOTALNETO, f.ENLACE_EMPRESA,
      LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor, p.CIF, ${pendiente} AS PendienteIcg
    FROM FACTURASCOMPRA f JOIN PROVEEDORES p ON p.CODPROVEEDOR = f.CODPROVEEDOR
    WHERE f.TIPODOC IN (12, 20) AND f.FECHA >= DATEADD(day, -${DIAS}, GETDATE())
      AND LTRIM(RTRIM(ISNULL(f.SUFACTURA, ''))) <> '' AND LTRIM(RTRIM(ISNULL(p.CIF, ''))) <> ''`);
  return r.recordset;
}

// Facturas de gastos de una BD de tiendas en la misma ventana (más el margen).
async function facturasTienda(g) {
  const r = await g.info.pool.request().query(`
    SELECT f.NUMSERIE, f.NUMFACTURA, f.N, f.FECHA, f.SUFACTURA, f.TOTALNETO, f.ENLACE_EMPRESA, p.CIF
    FROM FACTURASCOMPRA f JOIN PROVEEDORES p ON p.CODPROVEEDOR = f.CODPROVEEDOR
    WHERE f.TIPODOC IN (12, 20) AND f.FECHA >= DATEADD(day, -${DIAS + MARGEN_DIAS}, GETDATE())
      AND LTRIM(RTRIM(ISNULL(f.SUFACTURA, ''))) <> '' AND LTRIM(RTRIM(ISNULL(p.CIF, ''))) <> ''`);
  return r.recordset;
}

// De una lista de facturas de una BD, cuáles siguen pendientes en ICG (vencimiento 'P' > 0,10).
async function pendientesEnIcg(g, filas) {
  const tipos = await tiposDocumentoCompra(g.info.pool, g.bk);
  const out = new Set();
  if (!tipos.length) return out;
  for (let i = 0; i < filas.length; i += 500) {
    const rq = g.info.pool.request();
    const valores = filas.slice(i, i + 500).map((t, j) => {
      rq.input(`s${j}`, sql.NVarChar, String(t.NUMSERIE).trim()).input(`f${j}`, sql.Int, t.NUMFACTURA).input(`n${j}`, sql.NVarChar, String(t.N).trim());
      return `(@s${j}, @f${j}, @n${j})`;
    }).join(',');
    const r = await rq.query(`
      WITH K(SERIE, NUMERO, N) AS (SELECT * FROM (VALUES ${valores}) v(a, b, c))
      SELECT K.SERIE, K.NUMERO, K.N FROM K
      WHERE EXISTS (SELECT 1 FROM TESORERIA t WHERE t.ORIGEN = 'P' AND t.TIPODOCUMENTO IN (${sqlTipos(tipos)})
        AND t.SERIE = K.SERIE AND t.NUMERO = K.NUMERO AND t.N = K.N AND t.ESTADO = 'P' AND ABS(t.IMPORTE) > 0.10)`);
    for (const x of r.recordset) out.add(k3(x.SERIE, x.NUMERO, x.N));
  }
  return out;
}

// Detecta las parejas mayores → tienda y decide qué correspondería con cada una.
async function detectar() {
  const t0 = Date.now();
  const { porBd, errores, tiendas } = await bdsDelFlujo();

  // 1) Facturas de mayores, indexadas por RIF + número de factura del proveedor.
  const indice = new Map();
  const mayores = [];
  for (const g of [...porBd.values()].filter((x) => x.mayores)) {
    let filas;
    try { filas = await facturasMayores(g); } catch (e) { errores.push({ bd: g.info.dbName, mensaje: e.message, deTienda: false }); continue; }
    for (const f of filas) {
      const m = { g, f, gemelas: [] };
      mayores.push(m);
      const k = `${rif(f.CIF)}|${suFactura(f.SUFACTURA)}`;
      if (!indice.has(k)) indice.set(k, []);
      indice.get(k).push(m);
    }
  }

  // 2) Facturas de las tiendas que coinciden con alguna de mayores.
  const usosGemela = new Map(); // factura de tienda -> cuántas de mayores la reclaman
  const encontradas = new Map(); // BD de tienda -> sus facturas con pareja (para ver si siguen pendientes en ICG)
  for (const g of [...porBd.values()].filter((x) => !x.mayores)) {
    let filas;
    try { filas = await facturasTienda(g); } catch (e) { errores.push({ bd: g.info.dbName, mensaje: e.message, deTienda: true }); continue; }
    for (const t of filas) {
      const candidatas = indice.get(`${rif(t.CIF)}|${suFactura(t.SUFACTURA)}`);
      if (!candidatas) continue;
      for (const m of candidatas) {
        if (Math.abs(Number(t.TOTALNETO) - Number(m.f.TOTALNETO)) >= 0.01) continue;
        if (Math.abs(new Date(t.FECHA) - new Date(m.f.FECHA)) > MARGEN_DIAS * 86400000) continue;
        m.gemelas.push({ g, t });
        const kt = `${g.bk}|${k3(t.NUMSERIE, t.NUMFACTURA, t.N)}`;
        usosGemela.set(kt, (usosGemela.get(kt) || 0) + 1);
        if (!encontradas.has(g.bk)) encontradas.set(g.bk, { g, filas: [] });
        encontradas.get(g.bk).filas.push(t);
      }
    }
  }
  const pendientesTienda = new Set(); // bk|serie|num|n
  const sinPendientes = new Set();    // BD donde no se pudo ver: sus gemelas quedan "sin saber"
  for (const { g, filas } of encontradas.values()) {
    try {
      for (const k of await pendientesEnIcg(g, filas)) pendientesTienda.add(`${g.bk}|${k}`);
    } catch (e) { sinPendientes.add(g.bk); errores.push({ bd: g.info.dbName, mensaje: e.message, deTienda: true }); }
  }

  // 3) Qué correspondería con cada factura de mayores que tiene pareja.
  const casos = [];
  const resumen = { TRANSFERIR: 0, ETIQUETA: 0, AMBIGUO: 0, YA_TRANSFERIDO: 0, SIN_ACCION: 0 };
  for (const m of mayores.filter((x) => x.gemelas.length)) {
    const flM = m.g.flujos.get(k3(m.f.NUMSERIE, m.f.NUMFACTURA, m.f.N)) || null;
    const codM = flM ? flM.CodTienda : m.f.ENLACE_EMPRESA + (m.g.info.offset || 0);
    const tM = await datosTienda(tiendas, codM);
    const gemelas = [];
    for (const { g, t } of m.gemelas) {
      const flT = g.flujos.get(k3(t.NUMSERIE, t.NUMFACTURA, t.N)) || null;
      const codT = flT ? flT.CodTienda : t.ENLACE_EMPRESA + (g.info.offset || 0);
      const tT = await datosTienda(tiendas, codT);
      gemelas.push({
        codTienda: codT, tienda: tT.tienda, marca: tT.marca,
        numserie: String(t.NUMSERIE).trim(), numfactura: t.NUMFACTURA, n: String(t.N).trim(),
        fecha: t.FECHA, monto: Number(t.TOTALNETO), estado: flT ? flT.Estado : null, idFlujo: flT ? flT.IdFlujo : null,
        compartida: (usosGemela.get(`${g.bk}|${k3(t.NUMSERIE, t.NUMFACTURA, t.N)}`) || 0) > 1,
        pendienteIcg: sinPendientes.has(g.bk) ? null : pendientesTienda.has(`${g.bk}|${k3(t.NUMSERIE, t.NUMFACTURA, t.N)}`),
      });
    }
    const caso = {
      mayores: {
        codTienda: codM, tienda: tM.tienda, marca: tM.marca || (flM && flM.Marca) || null,
        numserie: String(m.f.NUMSERIE).trim(), numfactura: m.f.NUMFACTURA, n: String(m.f.N).trim(),
        proveedor: m.f.Proveedor, sufactura: String(m.f.SUFACTURA).trim(), fecha: m.f.FECHA, monto: Number(m.f.TOTALNETO),
        estado: flM ? flM.Estado : null, idFlujo: flM ? flM.IdFlujo : null, pendienteIcg: !!m.f.PendienteIcg,
        transferidoA: leerDestino(flM && flM.IcgTransferidoA),
      },
      gemelas,
    };
    const eM = caso.mayores.estado;
    const enApp = enFlujo(eM) || (caso.mayores.pendienteIcg && eM !== 'RECHAZADO' && eM !== 'TRANSFERIDO');
    if (eM === 'TRANSFERIDO') {
      caso.accion = 'YA_TRANSFERIDO'; caso.motivo = 'Ya está como Transferido.';
    } else if (!enApp) {
      caso.accion = 'SIN_ACCION';
      caso.motivo = eM === 'RECHAZADO' ? 'Está rechazado en la app.' : 'No está en el flujo de la app ni pendiente en ICG.';
    } else if (gemelas.length > 1 || gemelas.some((x) => x.compartida)) {
      caso.accion = 'AMBIGUO'; caso.motivo = 'Más de una factura coincide: no se toca, hay que revisarla a mano.';
    } else if (enFlujo(gemelas[0].estado)) {
      caso.accion = 'TRANSFERIR';
      caso.motivo = `La de la tienda ya está en el flujo (${estadoTxt(gemelas[0].estado)}): la de mayores pasa a Transferido y sale de las bandejas${eM ? ` (hoy está en ${estadoTxt(eM)})` : ''}.`;
      // Mayores ya lo pagó (o lo está pagando) y la de la tienda todavía no está pagada.
      if (['PAGADO', 'PAGO_EN_REVISION'].includes(eM) && gemelas[0].estado !== 'PAGADO') {
        caso.riesgo = true;
        caso.motivo += ` ⚠ Mayores ya lo ${eM === 'PAGADO' ? 'pagó' : 'está pagando'}: la de la tienda lleva la etiqueta "Ya pagado por mayores" para no pagarlo dos veces.`;
      }
    } else {
      caso.accion = 'ETIQUETA';
      caso.motivo = 'La de la tienda aún no entra al flujo: la de mayores sigue su flujo, con la etiqueta "Transferido en ICG"; la de la tienda, con "Ya pagado por mayores" / "También en mayores".';
      if (gemelas[0].pendienteIcg) {
        caso.riesgo = true;
        caso.motivo += ' ⚠ La de la tienda sigue pendiente en ICG: si la envían al flujo se pagaría dos veces.';
      } else if (gemelas[0].pendienteIcg === null) {
        caso.motivo += ' No se pudo ver en ICG si la de la tienda sigue pendiente.';
      } else {
        caso.motivo += ' En ICG la tienda ya la saldó, así que no debería entrar a la app.';
      }
    }
    resumen[caso.accion]++;
    casos.push(caso);
  }
  const orden = { TRANSFERIR: 0, AMBIGUO: 1, ETIQUETA: 2, YA_TRANSFERIDO: 3, SIN_ACCION: 4 };
  casos.sort((a, b) => orden[a.accion] - orden[b.accion] || new Date(b.mayores.fecha) - new Date(a.mayores.fecha));
  // BD de tiendas que no se pudieron revisar: una pareja "única" podría no serlo (la otra estaría
  // en esa BD), así que en esa vuelta no se aplica Transferido (ver revisar()).
  const erroresTienda = errores.filter((e) => e.deTienda).length;
  return { casos, resumen, errores, erroresTienda, segundos: Math.round((Date.now() - t0) / 100) / 10 };
}

// Aplica TRANSFERIR y ETIQUETA. Cada gasto en su propia transacción. TRANSFERIR solo si la de
// mayores sigue en el estado que vio la detección (que tarda: recorre todas las BD); si alguien
// la movió mientras tanto, se deja para la próxima vuelta. Un error en un caso no corta los demás.
async function aplicar(casos, { soloEtiquetas = false } = {}) {
  const app = await getPool();
  let transferidos = 0;
  let etiquetados = 0;
  const errores = [];
  // Con soloEtiquetas, los TRANSFERIR quedan solo con la etiqueta (sin cambiar de estado) hasta
  // una vuelta en la que se puedan revisar todas las BD.
  for (const c of casos.filter((x) => x.accion === 'ETIQUETA' || x.accion === 'TRANSFERIR')) {
    const m = c.mayores;
    const d = c.gemelas[0];
    const transferir = c.accion === 'TRANSFERIR' && !soloEtiquetas;
    const json = transferir ? destinoJson(d, { estadoMayoresAntes: m.estado || null }) : destinoJson(d);
    if (!transferir && m.transferidoA && destinoJson(m.transferidoA) === json) continue; // ya etiquetado
    const factura = `${d.numserie}-${d.numfactura}`;
    const comentario = transferir
      ? `Transferido a ${d.marca} · ${d.tienda}, factura ${factura} (${estadoTxt(d.estado)} en la app), que es la oficial. Este gasto de mayores sale de las bandejas${m.estado ? `; estaba en ${estadoTxt(m.estado)}` : ''}.`
      : c.accion === 'TRANSFERIR'
        ? `Transferido en ICG a ${d.marca} · ${d.tienda}, factura ${factura} (${estadoTxt(d.estado)} en la app), que es la oficial.`
        : `Transferido en ICG a ${d.marca} · ${d.tienda}, factura ${factura}. La factura de la tienda aún no entra al flujo de la app; este gasto sigue su flujo normal.`;
    const tx = new sql.Transaction(app);
    try {
      await tx.begin();
      const rq = new sql.Request(tx)
        .input('c', sql.Int, m.codTienda).input('s', sql.NVarChar, m.numserie).input('f', sql.Int, m.numfactura)
        .input('n', sql.NVarChar, m.n).input('m', sql.NVarChar, m.marca).input('j', sql.NVarChar(400), json)
        .input('com', sql.NVarChar, comentario).input('t', sql.Bit, transferir ? 1 : 0)
        .input('ev', sql.NVarChar(30), m.estado || null);
      const r = await rq.query(`
        SET NOCOUNT ON;
        DECLARE @id INT, @hubo INT = 0, @antes NVARCHAR(400), @estado NVARCHAR(30);
        SELECT @id = IdFlujo, @antes = IcgTransferidoA, @estado = Estado FROM dbo.GD_FacturaFlujo WITH (UPDLOCK, HOLDLOCK)
          WHERE CodTienda = @c AND NumSerie = @s AND NumFactura = @f AND N = @n;
        IF @id IS NULL
        BEGIN
          -- Para TRANSFERIR, solo si la detección tampoco la vio en el flujo.
          IF @t = 0 OR @ev IS NULL
          BEGIN
            INSERT INTO dbo.GD_FacturaFlujo (CodTienda, NumSerie, NumFactura, N, Marca, Estado, IcgTransferidoA, FechaActualizacion)
            VALUES (@c, @s, @f, @n, @m, CASE WHEN @t = 1 THEN 'TRANSFERIDO' ELSE 'PENDIENTE_ANALISTA' END, @j,
                    CASE WHEN @t = 1 THEN GETDATE() END);
            SET @id = SCOPE_IDENTITY(); SET @hubo = 1;
          END
        END
        ELSE IF @t = 1
        BEGIN
          UPDATE dbo.GD_FacturaFlujo SET Estado = 'TRANSFERIDO', FechaActualizacion = GETDATE(), IcgTransferidoA = @j
            WHERE IdFlujo = @id AND Estado = @ev AND Estado NOT IN ('TRANSFERIDO', 'RECHAZADO');
          SET @hubo = @@ROWCOUNT;
        END
        ELSE
        BEGIN
          UPDATE dbo.GD_FacturaFlujo SET IcgTransferidoA = @j
            WHERE IdFlujo = @id AND Estado NOT IN ('TRANSFERIDO', 'RECHAZADO') AND ISNULL(IcgTransferidoA, N'') <> @j;
          SET @hubo = CASE WHEN @@ROWCOUNT > 0 AND @antes IS NULL THEN 1 ELSE 0 END;
        END
        IF @hubo = 1
          INSERT INTO dbo.GD_FacturaAprobacion (IdFlujo, Etapa, IdUsuario, Decision, Comentario)
          VALUES (@id, 'SISTEMA', NULL, CASE WHEN @t = 1 THEN 'TRANSFERIDO' ELSE 'TRANSFERIDO_ICG' END, @com);
        SELECT @hubo AS hubo;`);
      await tx.commit();
      if (r.recordset[0].hubo) { if (transferir) transferidos++; else etiquetados++; }
    } catch (e) {
      await tx.rollback().catch(() => {});
      errores.push({ factura: `${m.numserie}-${m.numfactura}`, mensaje: e.message });
    }
  }
  cacheMapa = null; // el lado de la tienda se recalcula con lo nuevo
  if (errores.length) console.error('[seguimiento ICG] Transferencias de mayores, errores al aplicar:', errores.map((e) => `${e.factura}: ${e.mensaje}`).join(' | '));
  return { transferidos, etiquetados, errores };
}

// ── Lado de la tienda ───────────────────────────────────────────────────────────────────
// Facturas de tienda que también están en mayores: las que algún gasto de mayores tiene en
// IcgTransferidoA. Clave codTienda|serie|número|n → la de mayores { codTienda, marca, numserie,
// numfactura, n, estado, transferido }. Para TRANSFERIDO, estado = el que tenía la de mayores
// al transferirse (si estaba PAGADO, mayores ya lo pagó). Cacheado 1 minuto.
const claveTienda = (cod, serie, num, n) => `${cod}|${String(serie).trim()}|${num}|${String(n).trim()}`;
let cacheMapa = null;
async function mapaMayores() {
  if (cacheMapa && Date.now() - cacheMapa.ts < 60 * 1000) return cacheMapa.mapa;
  const app = await getPool();
  const r = await app.request().query(
    'SELECT CodTienda, Marca, NumSerie, NumFactura, N, Estado, IcgTransferidoA FROM dbo.GD_FacturaFlujo WHERE IcgTransferidoA IS NOT NULL');
  const mapa = new Map();
  for (const x of r.recordset) {
    const d = leerDestino(x.IcgTransferidoA);
    if (!d) continue;
    const transferido = x.Estado === 'TRANSFERIDO';
    mapa.set(claveTienda(d.codTienda, d.numserie, d.numfactura, d.n), {
      codTienda: x.CodTienda, marca: x.Marca, numserie: String(x.NumSerie).trim(), numfactura: x.NumFactura, n: String(x.N).trim(),
      estado: transferido ? (d.estadoMayoresAntes || null) : x.Estado, transferido,
    });
  }
  cacheMapa = { mapa, ts: Date.now() };
  return mapa;
}
// La de mayores de una factura de tienda (o null). Si la consulta falla, sin etiqueta.
async function mayoresDe() {
  try { return await mapaMayores(); } catch (e) { return new Map(); }
}

// Una revisión: detecta y, si el modo es "aplicar", aplica. Si alguna BD de tienda no se pudo
// revisar, esa vuelta solo pone etiquetas: Transferido no se deshace, y con una BD faltante una
// pareja que parece única podría no serlo.
async function revisar() {
  const r = await detectar();
  r.modo = modo();
  if (r.modo === 'aplicar') {
    const soloEtiquetas = r.erroresTienda > 0;
    r.aplicado = await aplicar(r.casos, { soloEtiquetas });
    r.transferirOmitido = soloEtiquetas ? r.resumen.TRANSFERIR : 0;
  }
  return r;
}

module.exports = { revisar, detectar, aplicar, modo, leerDestino, mayoresDe, claveTienda, MARCAS_MAYORES };
