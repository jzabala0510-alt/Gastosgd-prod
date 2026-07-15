// Similitud de nombres para reconciliar el Excel diario de saldos contra
// GENERAL.EMPRESASCONTABLES. Usado por el importador (Admin -> Alias de
// tiendas) y por el script CLI de reconciliación (tools/reconciliacion/).
// Una sola implementación para que ambos no puedan divergir.

const ACCENTS = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U' };
const normalize = (s) => String(s || '')
  .toUpperCase()
  .replace(/[ÁÉÍÓÚÑÜ]/g, (m) => ACCENTS[m])
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

// Tokens de ciudad/zona (y abreviaturas) que son "ruido" para comparar el
// núcleo del nombre: la tienda es la misma esté escrita "BARQUISIMETO" o "BQTO".
const CIUDADES = new Set(['BARQUISIMETO', 'BQTO', 'CARACAS', 'CCS', 'CUMANA', 'MARACAIBO', 'MCBO',
  'MARACAY', 'MCY', 'MARGARITA', 'MGTA', 'MRGT', 'MARGA', 'VALENCIA', 'VLN', 'VLNCIA', 'PUERTO', 'ORDAZ',
  'PTO', 'PZO', 'PARAGUANA', 'PUNTO', 'FIJO', 'SANCRISTOBAL', 'SAN', 'CRISTOBAL', 'MATURIN', 'VENEZUELA',
  'VZLA', 'VLA', 'NACIONAL', 'NACIONALES']);
// Formas jurídicas y años: puro ruido.
const JURIDICO = new Set(['CA', 'SA', 'SRL', 'SACA', 'COMPANIA', 'ANONIMA', 'C', 'A', 'S']);
const esAnio = (t) => /^20[12][0-9]$/.test(t);

const tokensCore = (s) => normalize(s).split(' ')
  .filter((t) => t && !CIUDADES.has(t) && !JURIDICO.has(t) && !esAnio(t));

function levRatio(a, b) {
  if (!a.length && !b.length) return 1;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[m][n] / Math.max(m, n);
}
function dice(aSet, bSet) {
  if (!aSet.size && !bSet.size) return 1;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  return (2 * inter) / (aSet.size + bSet.size);
}
// score 0..100 entre dos nombres ya reducidos a tokens núcleo.
function scoreNombres(coreTokensA, coreStrA, coreTokensB, coreStrB) {
  const setA = new Set(coreTokensA), setB = new Set(coreTokensB);
  const eq = setA.size === setB.size && [...setA].every((t) => setB.has(t));
  if (eq && setA.size) return 100;
  return Math.round(Math.max(dice(setA, setB), levRatio(coreStrA, coreStrB)) * 100);
}

function clasificar(sc) {
  if (sc === 100) return 'EXACTA';
  if (sc >= 82) return 'FUERTE';
  if (sc >= 60) return 'DUDOSA';
  return 'SIN_MATCH';
}

// Dos listas de tokens núcleo son "el mismo grupo/marca" si el conjunto
// coincide exactamente (ya sin ruido de C.A./comas/paréntesis).
function tokensIguales(a, b) {
  if (!a.length || !b.length) return false;
  const setA = new Set(a), setB = new Set(b);
  return setA.size === setB.size && [...setA].every((t) => setB.has(t));
}

// Prepara filas crudas de EMPRESASCONTABLES (CODIGO, Tienda, Zona, Grupo,
// Marca) con los campos derivados que el matching necesita, una sola vez
// por candidato. Grupo = EMPRESASCONTABLES.POBLACION, que corresponde al
// "Grupo Económico" del Excel (ej. "METAS", "TOP GROUP", "NASA").
function prepararCandidatos(rows) {
  return rows.map((x) => {
    const tok = tokensCore(x.Tienda);
    return {
      ...x, _tok: tok, _str: tok.join(' '),
      _zonaNorm: normalize(x.Zona), _marcaNorm: normalize(x.Marca),
      _grupoTok: tokensCore(x.Grupo),
    };
  });
}

// Mejor candidato ERP para una fila del Excel (prueba rs2 y rs1, se queda con
// el score más alto). Zona y Grupo Económico del Excel se usan como bono/
// penalización de desempate (no como filtro duro, para no perder candidatos
// por typos o por filas sin esos datos) — evita, por ejemplo, que "VS
// Valencia" (Zona=Valencia, Grupo=METAS) quede ambiguo contra "VS Punto
// Fijo" (sin zona ni grupo): el candidato correcto comparte zona Y grupo.
const BONUS_ZONA = 8;
const BONUS_GRUPO = 12;
function mejorCandidato(rs1, rs2, zonaExcel, grupoExcel, candidatosPreparados) {
  const zN = normalize(zonaExcel);
  const gTk = tokensCore(grupoExcel);
  let best = { score: -1, candidato: null };
  for (const nombre of [rs2, rs1]) {
    if (!nombre) continue;
    const tk = tokensCore(nombre), st = tk.join(' ');
    if (!tk.length) continue;
    for (const c of candidatosPreparados) {
      let sc = scoreNombres(tk, st, c._tok, c._str);
      // Aplicar bono de zona/grupo SIEMPRE, incluso a score=100.
      // Sin esto, varias tiendas con idéntico núcleo de nombre (ej. "ADI FO" tanto
      // para Maracay como para Caracas) reciben 100 y la zona nunca desempata,
      // haciendo que el algoritmo elija la primera que encuentra (arbitraria).
      // Con el fix: la tienda de zona correcta mantiene 100; la de zona incorrecta
      // baja a 92 (FUERTE) y queda marcada para revisión manual.
      let bono = 0;
      if (zN && c._zonaNorm) bono += zN === c._zonaNorm ? BONUS_ZONA : -BONUS_ZONA;
      if (gTk.length && c._grupoTok.length) bono += tokensIguales(gTk, c._grupoTok) ? BONUS_GRUPO : -BONUS_GRUPO;
      if (bono) sc = Math.max(0, Math.min(100, sc + bono));
      if (sc > best.score) best = { score: sc, candidato: c };
    }
  }
  const score = Math.max(best.score, 0);
  return { score, clasificacion: clasificar(score), candidato: best.candidato };
}

module.exports = { normalize, tokensCore, scoreNombres, clasificar, prepararCandidatos, mejorCandidato };
