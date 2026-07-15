# GastosGD — Control de Avance del Proyecto

**Fecha de corte:** Junio 2026  
**Sistema:** Gestión y aprobación de gastos por tienda  
**Flujo:** Analista → Tesorería → Auditor

---

## ✅ Completado

### Infraestructura
- [x] Proyecto configurado y funcional en ambiente de desarrollo
- [x] Comunicación entre frontend y backend establecida
- [x] Conexión a las bases de datos del ERP (lectura)
- [x] Base de datos propia del sistema (escritura de datos del flujo)
- [x] Almacenamiento de archivos adjuntos en disco

### Autenticación y Seguridad
- [x] Login con las credenciales existentes del ERP (sin contraseñas adicionales)
- [x] Control de acceso por rol (Analista / Tesorería / Auditor / Administrador)
- [x] Sesión con expiración automática

### Organización y Jerarquía
- [x] Estructura de zonas, marcas y tiendas leída directamente del ERP
- [x] Selector en cascada: Zona → Marca → Tienda
- [x] Pantalla de inicio con lista de zonas; al seleccionar una navega directamente a los gastos
- [x] El sistema recuerda la última tienda consultada al volver a entrar

### Módulo Gastos (Analista)
- [x] Lista de facturas de compra pendientes de pago, tomadas del ERP
- [x] Montos mostrados en bolívares (conversión automática)
- [x] Filtros: por fecha, proveedor y estado
- [x] Vista de detalle con el desglose de líneas de la factura
- [x] Carga de soportes (fotos, PDF y documentos)
- [x] Acción de aprobar para enviar a Tesorería
- [x] Acciones de devolver y rechazar con motivo
- [x] Reenvío: si una factura fue devuelta o rechazada, puede ser revisada y reenviada
- [x] Historial completo del flujo (quién hizo qué y cuándo)

### Módulo Tesorería
- [x] Solo muestra facturas previamente aprobadas por el Analista
- [x] Captura del monto disponible por tienda para el día
- [x] Indicador de cobertura: qué facturas entran dentro del disponible
- [x] Selección manual de qué facturas se van a pagar
- [x] Resumen del monto total seleccionado vs. disponible
- [x] Aprobación en lote de las facturas seleccionadas
- [x] Acciones de devolver y rechazar con motivo
- [x] Vista de detalle de cada factura

### Módulo Auditoría
- [x] Bandeja con todas las facturas pendientes de auditoría (todas las tiendas)
- [x] Vista de detalle completa para revisión
- [x] Acciones: aprobar, devolver y rechazar

---

## ⏳ Pendiente

### Funcionalidad
- [ ] Restricción de acceso por analista: que cada analista solo vea las tiendas que tiene asignadas
- [ ] Reportes y exportación (Excel / PDF)
- [ ] Notificaciones al cambiar el estado de una factura

### Técnico / Infraestructura
- [ ] Conexión a las tiendas de otras marcas (actualmente solo funciona una marca)
- [ ] Pruebas con usuarios y datos reales de producción
- [ ] Ajustes y correcciones post-prueba

### Despliegue
- [ ] Instalación en servidor de producción
- [ ] Configuración de acceso en red interna
- [ ] Capacitación a usuarios finales

---

## Resumen

| Área | Estado |
|---|---|
| Infraestructura base | ✅ Completo |
| Autenticación | ✅ Completo |
| Jerarquía y navegación | ✅ Completo |
| Módulo Analista | ✅ Completo |
| Módulo Tesorería | ✅ Completo |
| Módulo Auditoría | ✅ Completo |
| Restricción de acceso por analista | ⏳ Pendiente |
| Reportes | ⏳ Pendiente |
| Notificaciones | ⏳ Pendiente |
| Multi-marca completo | ⏳ Pendiente |
| Deploy a producción | ⏳ Pendiente |
