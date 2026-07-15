$outputPath = "C:\Proyectos\GastosGD\AVANCE_PROYECTO.docx"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

$doc = $word.Documents.Add()
$sel = $word.Selection

$chk = [string][char]0x2713   # ✓
$cir = [string][char]0x25CB   # ○
$arr = [string][char]0x2192   # →

# WdBuiltinStyle constants
$TITLE  = -87
$H1     = -2
$H2     = -3
$NORMAL = -1

function wH1($t) {
    $sel.Style = $doc.Styles.Item($H1)
    $sel.TypeText($t); $sel.TypeParagraph()
}
function wH2($t) {
    $sel.Style = $doc.Styles.Item($H2)
    $sel.TypeText($t); $sel.TypeParagraph()
}
function wItem($t, $done) {
    $sel.Style = $doc.Styles.Item($NORMAL)
    $prefix = if ($done) { "$chk   " } else { "$cir   " }
    $sel.TypeText($prefix + $t); $sel.TypeParagraph()
}
function wLine() {
    $sel.Style = $doc.Styles.Item($NORMAL)
    $sel.TypeText(""); $sel.TypeParagraph()
}

# ── TÍTULO ──────────────────────────────────────────────────────────────────
$sel.Style = $doc.Styles.Item($TITLE)
$sel.TypeText("GastosGD")
$sel.TypeParagraph()

$sel.Style = $doc.Styles.Item($NORMAL)
$sel.TypeText("Control de Avance del Proyecto")
$sel.TypeParagraph()
$sel.TypeText("Sistema: Gestión y aprobación de gastos por tienda")
$sel.TypeParagraph()
$sel.TypeText("Flujo de aprobación: Analista $arr Tesorería $arr Auditor")
$sel.TypeParagraph()
$sel.TypeText("Fecha de corte: Junio 2026")
$sel.TypeParagraph()
wLine

# ── COMPLETADO ───────────────────────────────────────────────────────────────
wH1 "COMPLETADO"

wH2 "Infraestructura"
wItem "Proyecto configurado y funcional en ambiente de desarrollo" $true
wItem "Comunicación entre frontend y backend establecida" $true
wItem "Conexión a las bases de datos del ERP (lectura)" $true
wItem "Base de datos propia del sistema para el flujo de aprobación" $true
wItem "Almacenamiento de archivos adjuntos en disco" $true
wLine

wH2 "Autenticación y Seguridad"
wItem "Login con las credenciales existentes del ERP (sin contraseñas adicionales)" $true
wItem "Control de acceso por rol: Analista, Tesorería, Auditor y Administrador" $true
wItem "Sesión con expiración automática" $true
wLine

wH2 "Organización y Jerarquía"
wItem "Estructura de zonas, marcas y tiendas leída directamente del ERP" $true
wItem "Selector en cascada: Zona $arr Marca $arr Tienda" $true
wItem "Pantalla de inicio con lista de zonas disponibles" $true
wItem "Al seleccionar una zona, navega directamente a los gastos de esa zona" $true
wItem "El sistema recuerda la última tienda consultada al volver a entrar" $true
wLine

wH2 "Módulo Gastos — Analista"
wItem "Lista de facturas de compra pendientes de pago, tomadas del ERP" $true
wItem "Montos mostrados en bolívares (conversión automática)" $true
wItem "Filtros por fecha, proveedor y estado" $true
wItem "Vista de detalle con el desglose de líneas de la factura" $true
wItem "Carga de soportes: fotos, PDF y documentos" $true
wItem "Acción de aprobar para enviar la factura a Tesorería" $true
wItem "Acciones de devolver y rechazar con motivo obligatorio" $true
wItem "Facturas devueltas o rechazadas pueden ser revisadas y reenviadas" $true
wItem "Historial completo del flujo: quién hizo qué y cuándo" $true
wLine

wH2 "Módulo Tesorería"
wItem "Solo muestra facturas previamente aprobadas por el Analista" $true
wItem "Captura del monto disponible por tienda para el día" $true
wItem "Indicador de cobertura: qué facturas entran dentro del monto disponible" $true
wItem "Selección manual de qué facturas se van a pagar" $true
wItem "Resumen del monto total seleccionado vs. monto disponible" $true
wItem "Aprobación en lote de las facturas seleccionadas" $true
wItem "Acciones de devolver y rechazar con motivo" $true
wItem "Vista de detalle de cada factura" $true
wLine

wH2 "Módulo Auditoría"
wItem "Bandeja con todas las facturas pendientes de auditoría (todas las tiendas)" $true
wItem "Vista de detalle completa para revisión" $true
wItem "Acciones: aprobar, devolver y rechazar" $true
wLine

# ── PENDIENTE ────────────────────────────────────────────────────────────────
wH1 "PENDIENTE"

wH2 "Funcionalidad"
wItem "Restricción de acceso: cada analista solo ve las tiendas que tiene asignadas" $false
wItem "Reportes y exportación (Excel / PDF)" $false
wItem "Notificaciones al cambiar el estado de una factura" $false
wLine

wH2 "Infraestructura"
wItem "Conexión a tiendas de todas las marcas del grupo (actualmente una marca)" $false
wItem "Pruebas con usuarios y datos reales de producción" $false
wItem "Ajustes y correcciones post-prueba" $false
wLine

wH2 "Despliegue"
wItem "Instalación en servidor de producción" $false
wItem "Configuración de acceso en red interna" $false
wItem "Capacitación a usuarios finales" $false
wLine

# ── TABLA RESUMEN ─────────────────────────────────────────────────────────────
wH1 "RESUMEN"

$tableRange = $sel.Range
$table = $doc.Tables.Add($tableRange, 12, 2)
foreach ($style in @("Table Grid", "Tabla con cuadrícula", "Grille du tableau")) {
    try { $table.Style = $style; break } catch {}
}
$table.Rows(1).HeadingFormat = -1

# Encabezados
$table.Cell(1,1).Range.Text = "Área"
$table.Cell(1,2).Range.Text = "Estado"
$table.Rows(1).Range.Font.Bold = $true

# Datos
$data = @(
    @("Infraestructura base",                    "Completo"),
    @("Autenticación",                           "Completo"),
    @("Jerarquía y navegación",                  "Completo"),
    @("Módulo Analista",                         "Completo"),
    @("Módulo Tesorería",                        "Completo"),
    @("Módulo Auditoría",                        "Completo"),
    @("Restricción de acceso por analista",      "Pendiente"),
    @("Reportes",                                "Pendiente"),
    @("Notificaciones",                          "Pendiente"),
    @("Multi-marca completo",                    "Pendiente"),
    @("Deploy a producción",                     "Pendiente")
)

for ($i = 0; $i -lt $data.Count; $i++) {
    $row = $i + 2
    $table.Cell($row, 1).Range.Text = $data[$i][0]
    $table.Cell($row, 2).Range.Text = $data[$i][1]
    if ($data[$i][1] -eq "Pendiente") {
        $table.Cell($row, 2).Range.Font.Color = 13382451  # naranja oscuro RGB(180,120,0) = 180 + 120*256 + 0*65536
    } else {
        $table.Cell($row, 2).Range.Font.Color = 4225331   # verde RGB(51,130,64) = 51 + 130*256 + 64*65536
    }
}

$table.Columns(1).Width = 300
$table.Columns(2).Width = 100

# ── GUARDAR ───────────────────────────────────────────────────────────────────
$doc.SaveAs2($outputPath, 16)   # 16 = wdFormatXMLDocument
$doc.Close($false)
$word.Quit()

Write-Output "Documento generado: $outputPath"
