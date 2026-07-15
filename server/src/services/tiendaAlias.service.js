const { sql, getPool, getGeneralPool } = require('../config/db');
const { normalize, prepararCandidatos, mejorCandidato } = require('./tiendaMatcher');

const CLAVE_CONTADOR = { EXACTA: 'exacta', FUERTE: 'fuerte', DUDOSA: 'dudosa', SIN_MATCH: 'sinMatch' };

// Solo lectura: nunca escribe. Para cada fila dice si ya hay un alias
// confirmado/ignorado (por nombre exacto) o, si no, sugiere por similitud
// contra EMPRESASCONTABLES.
async function sugerir(filas) {
  const app = await getPool();
  const gen = await getGeneralPool();

  const aliasRows = (await app.request().query(
    'SELECT NormRS1, NormRS2, Estado, CodTienda FROM dbo.GD_TiendaAlias')).recordset;
  const aliasPorNorm = new Map();
  for (const a of aliasRows) {
    if (a.NormRS1) aliasPorNorm.set(a.NormRS1, a);
    if (a.NormRS2) aliasPorNorm.set(a.NormRS2, a);
  }

  const erpRaw = (await gen.request().query(
    "SELECT CODIGO, LTRIM(RTRIM(DESCRIPCION)) AS Tienda, LTRIM(RTRIM(PROVINCIA)) AS Zona, LTRIM(RTRIM(POBLACION)) AS Grupo, LTRIM(RTRIM(DIRECCION)) AS Marca FROM EMPRESASCONTABLES"
  )).recordset;
  const candidatos = prepararCandidatos(erpRaw);
  const porCodigo = new Map(candidatos.map((c) => [c.CODIGO, c]));

  const resumen = { total: 0, yaConfirmado: 0, yaIgnorado: 0, exacta: 0, fuerte: 0, dudosa: 0, sinMatch: 0 };
  const filasOut = filas.map((f) => {
    resumen.total++;
    const n1 = f.rs1 ? normalize(f.rs1) : null;
    const n2 = f.rs2 ? normalize(f.rs2) : null;
    const alias = (n1 && aliasPorNorm.get(n1)) || (n2 && aliasPorNorm.get(n2));

    if (alias) {
      if (alias.Estado === 'IGNORADO') { resumen.yaIgnorado++; return { ...f, estado: 'YA_IGNORADO', score: null }; }
      resumen.yaConfirmado++;
      const tienda = porCodigo.get(alias.CodTienda);
      return {
        ...f, estado: 'YA_CONFIRMADO', score: null, codTienda: alias.CodTienda,
        tienda: tienda ? tienda.Tienda : null, zonaErp: tienda ? tienda.Zona : null,
        grupoErp: tienda ? tienda.Grupo : null, marcaErp: tienda ? tienda.Marca : null,
      };
    }

    const { score, clasificacion, candidato } = mejorCandidato(f.rs1, f.rs2, f.zona, f.grupo, candidatos);
    resumen[CLAVE_CONTADOR[clasificacion]]++;
    return {
      ...f, estado: clasificacion, score,
      codTienda: candidato ? candidato.CODIGO : null,
      tienda: candidato ? candidato.Tienda : null,
      zonaErp: candidato ? candidato.Zona : null,
      grupoErp: candidato ? candidato.Grupo : null,
      marcaErp: candidato ? candidato.Marca : null,
    };
  });

  return { resumen, filas: filasOut };
}

// Upsert en lote. Recalcula NormRS1/NormRS2 en el servidor (nunca se confía
// en un normalizado mandado por el cliente).
async function confirmar(decisiones, idUsuario) {
  const pool = await getPool();

  let confirmadas = 0, ignoradas = 0, invalidas = 0;
  for (const d of decisiones) {
    const accion = d.accion === 'IGNORAR' ? 'IGNORADO' : 'CONFIRMADO';
    const codTienda = accion === 'CONFIRMADO' ? Number(d.codTienda) : null;
    if (accion === 'CONFIRMADO' && !Number.isInteger(codTienda)) { invalidas++; continue; }
    const n1 = d.rs1 ? normalize(d.rs1) : null;
    const n2 = d.rs2 ? normalize(d.rs2) : null;
    if (!n1 && !n2) { invalidas++; continue; }

    const existente = await pool.request().input('n1', sql.NVarChar, n1).input('n2', sql.NVarChar, n2).query(
      'SELECT TOP 1 IdAlias FROM dbo.GD_TiendaAlias WHERE (@n1 IS NOT NULL AND NormRS1 = @n1) OR (@n2 IS NOT NULL AND NormRS2 = @n2)');

    const campos = pool.request()
      .input('rs1', sql.NVarChar, d.rs1 || null).input('rs2', sql.NVarChar, d.rs2 || null)
      .input('n1', sql.NVarChar, n1).input('n2', sql.NVarChar, n2)
      .input('zona', sql.NVarChar, d.zona || null).input('grupo', sql.NVarChar, d.grupo || null).input('marca', sql.NVarChar, d.marca || null)
      .input('fila', sql.Int, d.fila ?? null)
      .input('estado', sql.NVarChar, accion).input('cod', sql.Int, codTienda)
      .input('score', sql.Int, d.score ?? null).input('clasif', sql.NVarChar, d.estado || null)
      .input('u', sql.Int, idUsuario);

    if (existente.recordset.length) {
      await campos.input('id', sql.Int, existente.recordset[0].IdAlias).query(`
        UPDATE dbo.GD_TiendaAlias SET
          NombreRS1=@rs1, NombreRS2=@rs2, NormRS1=@n1, NormRS2=@n2,
          ZonaExcel=@zona, GrupoExcel=@grupo, MarcaExcel=@marca, Estado=@estado, CodTienda=@cod,
          ScoreOriginal=@score, ClasifOriginal=@clasif, FechaEdicion=GETDATE()
        WHERE IdAlias=@id`);
    } else {
      await campos.query(`
        INSERT INTO dbo.GD_TiendaAlias
          (FilaExcel, NombreRS1, NombreRS2, NormRS1, NormRS2, ZonaExcel, GrupoExcel, MarcaExcel, Estado, CodTienda, ScoreOriginal, ClasifOriginal, IdUsuario)
        VALUES (@fila, @rs1, @rs2, @n1, @n2, @zona, @grupo, @marca, @estado, @cod, @score, @clasif, @u)`);
    }
    if (accion === 'CONFIRMADO') confirmadas++; else ignoradas++;
  }
  return { confirmadas, ignoradas, invalidas };
}

// Listado de alias ya decididos.
async function listar() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT a.IdAlias, a.FilaExcel, a.NombreRS1, a.NombreRS2, a.ZonaExcel, a.GrupoExcel, a.MarcaExcel,
           a.Estado, a.CodTienda, a.ScoreOriginal, a.ClasifOriginal,
           LTRIM(RTRIM(u.Usuario)) AS Usuario, a.FechaRegistro, a.FechaEdicion,
           LTRIM(RTRIM(ec.DESCRIPCION)) AS TiendaErp, LTRIM(RTRIM(ec.PROVINCIA)) AS ZonaErp,
           LTRIM(RTRIM(ec.POBLACION)) AS GrupoErp, LTRIM(RTRIM(ec.DIRECCION)) AS MarcaErp
    FROM dbo.GD_TiendaAlias a
    LEFT JOIN dbo.GD_Usuario u ON u.IdUsuario = a.IdUsuario
    LEFT JOIN GENERAL.dbo.EMPRESASCONTABLES ec ON ec.CODIGO = a.CodTienda
    ORDER BY a.FechaRegistro DESC`);
  return r.recordset;
}

// Universo completo de EMPRESASCONTABLES, para el buscador de tiendas (Admin -> Alias de
// tiendas). No usar jerarquia.service aquí: ese filtra por zona/marca-nacional para la
// navegación normal de la app, y deja afuera "tiendas" con zona vacía que no son TOP
// GROUP/MAYORES pero sí pueden ser destino real de un alias (ej. Vs Punto Fijo, C.A.2023).
async function tiendasErp() {
  const gen = await getGeneralPool();
  const r = await gen.request().query(
    "SELECT CODIGO AS CodTienda, LTRIM(RTRIM(DESCRIPCION)) AS Tienda, LTRIM(RTRIM(PROVINCIA)) AS Zona, LTRIM(RTRIM(POBLACION)) AS Grupo, LTRIM(RTRIM(DIRECCION)) AS Marca FROM EMPRESASCONTABLES ORDER BY Tienda");
  return r.recordset;
}

// Corrige un alias existente. { codTienda? , estado? }.
// Devuelve {ok:true} o {error: mensaje} para los 400 esperados (misma validación que antes).
async function actualizarAlias(id, { estado, codTienda }) {
  const pool = await getPool();
  const sets = [];
  const request = pool.request().input('id', sql.Int, id);

  if (estado === 'IGNORADO') {
    sets.push("Estado='IGNORADO'", 'CodTienda=NULL');
  } else if (codTienda != null) {
    const cod = Number(codTienda);
    if (!Number.isInteger(cod)) return { error: 'codTienda inválido' };
    request.input('cod', sql.Int, cod);
    sets.push("Estado='CONFIRMADO'", 'CodTienda=@cod');
  }
  if (!sets.length) return { error: 'Nada para actualizar' };
  sets.push('FechaEdicion=GETDATE()');
  await request.query(`UPDATE dbo.GD_TiendaAlias SET ${sets.join(', ')} WHERE IdAlias=@id`);
  return { ok: true };
}

module.exports = { sugerir, confirmar, listar, tiendasErp, actualizarAlias };
