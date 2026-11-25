// Excel con formato (títulos, encabezados, bordes, anchos, montos alineados) usando ExcelJS.
// ExcelJS se carga solo al exportar (import dinámico), así no pesa en la carga de la app.
//
// descargarExcel('archivo.xlsx', [hoja, ...]) — cada hoja:
//   { nombre: 'Movimientos', titulo: 'Auditoría de usuarios — JOSE BELLO', subtitulo: ['Rango: …'],
//     columnas: [{ titulo: 'Total (Bs)', clave: 'total', ancho: 16, tipo: 'monto' | 'entero' | 'texto' | 'auto', ajustar: true }],
//     filas: [{ ... }], estiloFila: (fila) => 'seccion' | 'total' | null, filtro: true }

const COLOR = {
  oscuro: 'FF202020', blanco: 'FFFFFFFF', borde: 'FFD1D5DB', gris: 'FF6B7280',
  seccion: 'FFEAF3DC', textoSeccion: 'FF3F5A10', cebra: 'FFF9FAFB', total: 'FFF3F4F6',
};
const bordeFino = { style: 'thin', color: { argb: COLOR.borde } };
const BORDES = { top: bordeFino, left: bordeFino, bottom: bordeFino, right: bordeFino };

function formatoDe(tipo, valor) {
  const t = tipo === 'auto' ? (typeof valor === 'number' ? (Number.isInteger(valor) ? 'entero' : 'monto') : 'texto') : tipo;
  if (t === 'monto') return { numFmt: '#,##0.00', horizontal: 'right' };
  if (t === 'entero') return { numFmt: '#,##0', horizontal: 'right' };
  return { numFmt: null, horizontal: 'left' };
}

export async function descargarExcel(nombreArchivo, hojas) {
  const { default: ExcelJS } = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  libro.creator = 'GastosGD';
  libro.created = new Date();

  for (const h of hojas) {
    const ws = libro.addWorksheet(String(h.nombre).slice(0, 31), {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const nCols = h.columnas.length;
    ws.columns = h.columnas.map((c) => ({ key: c.clave, width: c.ancho || 16 }));
    let r = 1;

    // Título y subtítulos
    if (h.titulo) {
      ws.mergeCells(r, 1, r, nCols);
      const c = ws.getCell(r, 1);
      c.value = h.titulo;
      c.font = { bold: true, size: 14, color: { argb: COLOR.oscuro } };
      c.alignment = { vertical: 'middle' };
      ws.getRow(r).height = 24;
      r++;
    }
    for (const s of h.subtitulo || []) {
      ws.mergeCells(r, 1, r, nCols);
      const c = ws.getCell(r, 1);
      c.value = s;
      c.font = { size: 10, color: { argb: COLOR.gris } };
      r++;
    }
    if (h.titulo || (h.subtitulo || []).length) r++;

    // Encabezado
    const filaEnc = r;
    h.columnas.forEach((col, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = col.titulo;
      c.font = { bold: true, color: { argb: COLOR.blanco } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.oscuro } };
      c.alignment = { vertical: 'middle', horizontal: ['monto', 'entero'].includes(col.tipo) ? 'right' : 'left', wrapText: true };
      c.border = BORDES;
    });
    ws.getRow(r).height = 22;
    r++;

    // Filas
    h.filas.forEach((fila, idx) => {
      const estilo = h.estiloFila ? h.estiloFila(fila) : null;
      if (estilo === 'seccion') {
        ws.mergeCells(r, 1, r, nCols);
        const c = ws.getCell(r, 1);
        c.value = fila[h.columnas[0].clave];
        c.font = { bold: true, color: { argb: COLOR.textoSeccion } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.seccion } };
        c.border = BORDES;
        ws.getRow(r).height = 20;
        r++;
        return;
      }
      h.columnas.forEach((col, i) => {
        const c = ws.getCell(r, i + 1);
        const v = fila[col.clave];
        c.value = v === undefined || v === '' ? null : v;
        const f = formatoDe(col.tipo || 'texto', v);
        if (f.numFmt) c.numFmt = f.numFmt;
        c.alignment = { vertical: 'top', horizontal: f.horizontal, wrapText: !!col.ajustar, indent: col.sangria && fila._sangria ? 1 : 0 };
        c.border = BORDES;
        if (estilo === 'total') {
          c.font = { bold: true };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.total } };
        } else if (idx % 2 === 1) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cebra } };
        }
      });
      r++;
    });

    // Encabezado fijo al bajar y filtros
    ws.views = [{ state: 'frozen', ySplit: filaEnc }];
    if (h.filtro && h.filas.length) ws.autoFilter = { from: { row: filaEnc, column: 1 }, to: { row: r - 1, column: nCols } };
  }

  const buf = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
