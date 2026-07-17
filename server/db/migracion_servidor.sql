-- ============================================================
--  SCRIPT DE MIGRACIÓN — GASTOSGD (Programación de Pagos)
--  Base de datos destino: GASTOSGD  (BD propia de la app)
--  Ejecutar UNA VEZ en el servidor de producción.
--  Todas las sentencias son idempotentes (se puede re-ejecutar).
--
--  Modelo (igual que Costo_Venezuela):
--    • GASTOSGD  -> tablas propias de la app (este script)
--    • GENERAL   -> usuarios y empresas del ERP (solo lectura)
--    • <marcas>  -> facturas de compra de cada marca (solo lectura)
--  Las 3 conviven en el MISMO servidor SQL.
--
--  Consolida: 01_schema + 03_auth + 05_facturas + 06_analista + 07_pagos
--  + 08_bancos + 09_ajuste_tesoreria + 10_reconciliacion + 11_pago_en_revision
--  (solo el flujo v2 sobre FACTURAS DE COMPRA; sin tablas v1 legacy).
--  Última actualización: 2026-07-09
-- ============================================================

-- 0. Crear la BD de la app si no existe
IF DB_ID('GASTOSGD') IS NULL
BEGIN
    CREATE DATABASE GASTOSGD;
    PRINT '✅ Base de datos GASTOSGD creada.';
END
ELSE
    PRINT '⏭  Base de datos GASTOSGD ya existe.';
GO

USE GASTOSGD;
GO

-- ============================================================
-- 1. GD_Usuario — mapea el usuario ICG (GENERAL.USUARIOS) a su rol.
--    NO guarda contraseña; el login se valida contra ICG.
-- ============================================================
IF OBJECT_ID('dbo.GD_Usuario','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_Usuario (
        IdUsuario      INT IDENTITY(1,1) PRIMARY KEY,
        CodUsuarioIcg  INT           NULL,
        Usuario        NVARCHAR(50)  NULL,
        Nombre         NVARCHAR(100) NULL,
        Rol            NVARCHAR(120) NOT NULL,   -- CSV: uno o varios roles separados por coma
        Activo         BIT           NOT NULL CONSTRAINT DF_GD_Usuario_Activo DEFAULT (1),
        FechaCreacion  DATETIME      NOT NULL CONSTRAINT DF_GD_Usuario_Fecha DEFAULT (GETDATE()),
        CONSTRAINT UQ_GD_Usuario_Icg UNIQUE (CodUsuarioIcg)
    );
    PRINT '✅ Tabla GD_Usuario creada.';
END
ELSE
    PRINT '⏭  Tabla GD_Usuario ya existe.';
GO

-- Multi-rol: la columna Rol guarda varios roles (CSV). Quitar el CHECK de valor
-- único (si viene de una versión anterior) y asegurar tamaño suficiente.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_Usuario_Rol')
BEGIN
    ALTER TABLE dbo.GD_Usuario DROP CONSTRAINT CK_GD_Usuario_Rol;
    PRINT '✅ Quitado CK_GD_Usuario_Rol (ahora multi-rol).';
END
GO
IF (SELECT max_length FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GD_Usuario') AND name = 'Rol') < 240
BEGIN
    ALTER TABLE dbo.GD_Usuario ALTER COLUMN Rol NVARCHAR(120) NOT NULL;
    PRINT '✅ Columna Rol ampliada a NVARCHAR(120).';
END
GO

-- ============================================================
-- 2. GD_UsuarioAmbito — alcance: qué tiendas/zonas ve cada usuario.
-- ============================================================
IF OBJECT_ID('dbo.GD_UsuarioAmbito','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_UsuarioAmbito (
        IdAmbito    INT IDENTITY(1,1) PRIMARY KEY,
        IdUsuario   INT NOT NULL,
        CodAlmacen  NVARCHAR(3)  NULL,
        Zona        NVARCHAR(60) NULL,   -- alcance por zona (EMPRESASCONTABLES.PROVINCIA)
        CodMarca    INT NULL,
        CONSTRAINT FK_GD_UsuarioAmbito_Usuario FOREIGN KEY (IdUsuario)
            REFERENCES dbo.GD_Usuario(IdUsuario) ON DELETE CASCADE
    );
    CREATE INDEX IX_GD_UA_Usuario ON dbo.GD_UsuarioAmbito(IdUsuario);
    PRINT '✅ Tabla GD_UsuarioAmbito creada.';
END
ELSE
    PRINT '⏭  Tabla GD_UsuarioAmbito ya existe.';
GO

-- Alcance por zona (v12): asegura ancho e índice en instalaciones previas.
IF (SELECT max_length FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.GD_UsuarioAmbito') AND name = 'Zona') < 120
    ALTER TABLE dbo.GD_UsuarioAmbito ALTER COLUMN Zona NVARCHAR(60) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GD_UA_Usuario')
    CREATE INDEX IX_GD_UA_Usuario ON dbo.GD_UsuarioAmbito(IdUsuario);
GO

-- ============================================================
-- 3. GD_FacturaFlujo — estado del flujo por factura de compra.
--    Clave de negocio: CodTienda + NumSerie + NumFactura + N.
--    CodTienda = EMPRESASCONTABLES.CODIGO (global) -> una sola BD
--    central sirve para TODAS las marcas.
-- ============================================================
IF OBJECT_ID('dbo.GD_FacturaFlujo','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_FacturaFlujo (
        IdFlujo            INT IDENTITY(1,1) PRIMARY KEY,
        CodTienda          INT NOT NULL,
        Marca              NVARCHAR(60) NULL,
        NumSerie           NVARCHAR(10) NOT NULL,
        NumFactura         INT NOT NULL,
        N                  NCHAR(1) NOT NULL,
        Estado             NVARCHAR(20) NOT NULL CONSTRAINT DF_GD_FF_Estado DEFAULT ('PENDIENTE_ANALISTA'),
        FechaActualizacion DATETIME NULL,
        FechaCreacion      DATETIME NOT NULL CONSTRAINT DF_GD_FF_FCrea DEFAULT (GETDATE()),
        CONSTRAINT UQ_GD_FF UNIQUE (CodTienda, NumSerie, NumFactura, N),
        CONSTRAINT CK_GD_FF_Estado CHECK (Estado IN (
            'PENDIENTE_ANALISTA','PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA',
            'PENDIENTE_PAGO','PAGO_EN_REVISION','PAGADO','APROBADO','RECHAZADO','DEVUELTO'))
    );
    CREATE INDEX IX_GD_FF_Estado ON dbo.GD_FacturaFlujo(Estado);
    PRINT '✅ Tabla GD_FacturaFlujo creada.';
END
ELSE
    PRINT '⏭  Tabla GD_FacturaFlujo ya existe.';
GO

-- ============================================================
-- 4. GD_FacturaAdjunto — soportes y comprobantes por factura.
-- ============================================================
IF OBJECT_ID('dbo.GD_FacturaAdjunto','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_FacturaAdjunto (
        IdAdjunto      INT IDENTITY(1,1) PRIMARY KEY,
        IdFlujo        INT NOT NULL,
        Tipo           NVARCHAR(20)  NOT NULL CONSTRAINT DF_GD_FA_Tipo DEFAULT ('SOPORTE'),
        RutaArchivo    NVARCHAR(400) NOT NULL,
        NombreOriginal NVARCHAR(200) NULL,
        Mime           NVARCHAR(100) NULL,
        Tamano         INT NULL,
        FechaSubida    DATETIME NOT NULL CONSTRAINT DF_GD_FA_Fecha DEFAULT (GETDATE()),
        CONSTRAINT FK_GD_FA_Flujo FOREIGN KEY (IdFlujo)
            REFERENCES dbo.GD_FacturaFlujo(IdFlujo) ON DELETE CASCADE,
        CONSTRAINT CK_GD_FA_Tipo CHECK (Tipo IN ('FACTURA','SOPORTE','FOTO','OTRO','COMPROBANTE'))
    );
    PRINT '✅ Tabla GD_FacturaAdjunto creada.';
END
ELSE
    PRINT '⏭  Tabla GD_FacturaAdjunto ya existe.';
GO

-- ============================================================
-- 5. GD_FacturaAprobacion — historial del flujo (quién y cuándo).
-- ============================================================
IF OBJECT_ID('dbo.GD_FacturaAprobacion','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_FacturaAprobacion (
        IdAprobacion INT IDENTITY(1,1) PRIMARY KEY,
        IdFlujo      INT NOT NULL,
        Etapa        NVARCHAR(20)  NOT NULL,
        IdUsuario    INT NOT NULL,
        Decision     NVARCHAR(20)  NOT NULL,
        Comentario   NVARCHAR(500) NULL,
        Fecha        DATETIME NOT NULL CONSTRAINT DF_GD_FAp_Fecha DEFAULT (GETDATE()),
        CONSTRAINT FK_GD_FAp_Flujo   FOREIGN KEY (IdFlujo)   REFERENCES dbo.GD_FacturaFlujo(IdFlujo) ON DELETE CASCADE,
        CONSTRAINT FK_GD_FAp_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario),
        CONSTRAINT CK_GD_FAp_Etapa    CHECK (Etapa IN ('ANALISTA','TESORERIA','AUDITORIA','PAGADOR','AUDITOR_PAGO')),
        CONSTRAINT CK_GD_FAp_Decision CHECK (Decision IN ('APROBADO','RECHAZADO','DEVUELTO','PAGADO','PAGO_EN_REVISION','CONFIRMADO'))
    );
    PRINT '✅ Tabla GD_FacturaAprobacion creada.';
END
ELSE
    PRINT '⏭  Tabla GD_FacturaAprobacion ya existe.';
GO

-- ============================================================
-- 6. GD_DispTienda — fondos disponibles que captura Tesorería (Bs).
-- ============================================================
IF OBJECT_ID('dbo.GD_DispTienda','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_DispTienda (
        IdDisp          INT IDENTITY(1,1) PRIMARY KEY,
        CodTienda       INT NOT NULL,
        Fecha           DATE NOT NULL,
        CodMoneda       INT NOT NULL CONSTRAINT DF_GD_DT_Mon DEFAULT (2),
        MontoDisponible DECIMAL(18,2) NOT NULL,
        IdUsuario       INT NOT NULL,
        FechaRegistro   DATETIME NOT NULL CONSTRAINT DF_GD_DT_Fecha DEFAULT (GETDATE()),
        CONSTRAINT UQ_GD_DT UNIQUE (CodTienda, Fecha, CodMoneda),
        CONSTRAINT FK_GD_DT_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario)
    );
    PRINT '✅ Tabla GD_DispTienda creada.';
END
ELSE
    PRINT '⏭  Tabla GD_DispTienda ya existe.';
GO

-- ============================================================
-- 6b. VistoPorAnalista — controla el badge/notificación en Gastos.
--     Cuando el analista abre el detalle de una factura PAGADA, se marca 1
--     y desaparece del badge verde en el menú.
-- ============================================================
IF COL_LENGTH('dbo.GD_FacturaFlujo', 'VistoPorAnalista') IS NULL
BEGIN
    ALTER TABLE dbo.GD_FacturaFlujo
        ADD VistoPorAnalista BIT NOT NULL CONSTRAINT DF_GD_FF_Visto DEFAULT (0);
    PRINT '✅ Columna VistoPorAnalista agregada a GD_FacturaFlujo.';
END
ELSE
    PRINT '⏭  Columna VistoPorAnalista ya existe.';
GO

-- ============================================================
-- 6c. GD_Banco — catálogo editable de bancos (Saldos por banco).
--     Antes GD_DispTienda guardaba un solo saldo por tienda/fecha;
--     ahora se desglosa por banco (Analista carga uno por cada banco).
-- ============================================================
IF OBJECT_ID('dbo.GD_Banco','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_Banco (
        IdBanco       INT IDENTITY(1,1) PRIMARY KEY,
        Nombre        NVARCHAR(80) NOT NULL,
        Orden         INT NOT NULL CONSTRAINT DF_GD_Banco_Orden DEFAULT (0),
        Activo        BIT NOT NULL CONSTRAINT DF_GD_Banco_Activo DEFAULT (1),
        FechaCreacion DATETIME NOT NULL CONSTRAINT DF_GD_Banco_Fecha DEFAULT (GETDATE()),
        CONSTRAINT UQ_GD_Banco_Nombre UNIQUE (Nombre)
    );
    PRINT '✅ Tabla GD_Banco creada.';
END
ELSE
    PRINT '⏭  Tabla GD_Banco ya existe.';
GO

-- Seed: bancos solicitados (no duplica si ya existen; se pueden agregar más
-- después desde Admin → Bancos, sin tocar este script).
INSERT INTO dbo.GD_Banco (Nombre, Orden)
SELECT v.Nombre, v.Orden
FROM (VALUES
    (N'BANCO MERCANTIL', 1),
    (N'BANESCO', 2),
    (N'BNC', 3),
    (N'BANCO DE VENEZUELA', 4),
    (N'BANCO FONDO COMUN', 5),
    (N'BANCO EXTERIOR', 6),
    (N'BANCO DEL SUR', 7),
    (N'BANCAMIGA', 8),
    (N'BANCO DEL TESORO', 9),
    (N'100% BANCO', 10)
) AS v(Nombre, Orden)
WHERE NOT EXISTS (SELECT 1 FROM dbo.GD_Banco b WHERE b.Nombre = v.Nombre);
PRINT '✅ Catálogo de bancos sembrado (si hacía falta).';
GO

-- GD_DispTienda: agrega IdBanco. Las filas previas (saldo único, sin banco)
-- se migran al primer banco del catálogo para no perder datos ya cargados.
IF COL_LENGTH('dbo.GD_DispTienda', 'IdBanco') IS NULL
    ALTER TABLE dbo.GD_DispTienda ADD IdBanco INT NULL;
GO

UPDATE dbo.GD_DispTienda
SET IdBanco = (SELECT TOP 1 IdBanco FROM dbo.GD_Banco ORDER BY Orden)
WHERE IdBanco IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GD_DispTienda') AND name = 'IdBanco' AND is_nullable = 1)
BEGIN
    ALTER TABLE dbo.GD_DispTienda ALTER COLUMN IdBanco INT NOT NULL;
    PRINT '✅ Columna IdBanco de GD_DispTienda ahora es NOT NULL.';
END
GO

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_GD_DT')
BEGIN
    ALTER TABLE dbo.GD_DispTienda DROP CONSTRAINT UQ_GD_DT;
    PRINT '✅ Quitada UQ_GD_DT (única por tienda/fecha/moneda, sin banco).';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_GD_DT_Banco')
BEGIN
    ALTER TABLE dbo.GD_DispTienda ADD CONSTRAINT UQ_GD_DT_Banco UNIQUE (CodTienda, Fecha, CodMoneda, IdBanco);
    PRINT '✅ GD_DispTienda ahora es única por tienda/fecha/moneda/banco.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GD_DT_Banco')
BEGIN
    ALTER TABLE dbo.GD_DispTienda ADD CONSTRAINT FK_GD_DT_Banco FOREIGN KEY (IdBanco) REFERENCES dbo.GD_Banco(IdBanco);
    PRINT '✅ FK de GD_DispTienda a GD_Banco creada.';
END
GO

-- ============================================================
-- 6d. GD_DispAjuste — ajuste manual de Tesorería sobre el total del
--     día (diferencia sobre la suma de bancos). No toca el desglose
--     por banco que carga el Analista en Saldos.
-- ============================================================
IF OBJECT_ID('dbo.GD_DispAjuste','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_DispAjuste (
        IdAjuste      INT IDENTITY(1,1) PRIMARY KEY,
        CodTienda     INT NOT NULL,
        Fecha         DATE NOT NULL,
        MontoAjuste   DECIMAL(18,2) NOT NULL,
        IdUsuario     INT NOT NULL,
        FechaRegistro DATETIME NOT NULL CONSTRAINT DF_GD_DA_Fecha DEFAULT (GETDATE()),
        CONSTRAINT UQ_GD_DA UNIQUE (CodTienda, Fecha),
        CONSTRAINT FK_GD_DA_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario)
    );
    PRINT '✅ Tabla GD_DispAjuste creada.';
END
ELSE
    PRINT '⏭  Tabla GD_DispAjuste ya existe.';
GO

-- ============================================================
-- 6e. GD_TiendaAlias — equivalencia NombreExcel -> CodTienda para
--     reconciliar el Excel diario de saldos con el ERP. Se llena
--     desde Admin -> Alias de tiendas (fuzzy sugiere, admin confirma).
-- ============================================================
IF OBJECT_ID('dbo.GD_TiendaAlias','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_TiendaAlias (
        IdAlias        INT IDENTITY(1,1) PRIMARY KEY,
        FilaExcel      INT NULL,
        NombreRS1      NVARCHAR(200) NULL,
        NombreRS2      NVARCHAR(200) NULL,
        NormRS1        NVARCHAR(200) NULL,
        NormRS2        NVARCHAR(200) NULL,
        ZonaExcel      NVARCHAR(60)  NULL,
        GrupoExcel     NVARCHAR(120) NULL,
        MarcaExcel     NVARCHAR(60)  NULL,
        Estado         NVARCHAR(20)  NOT NULL CONSTRAINT DF_GD_TA_Estado DEFAULT ('CONFIRMADO'),
        CodTienda      INT NULL,
        ScoreOriginal  INT NULL,
        ClasifOriginal NVARCHAR(20) NULL,
        IdUsuario      INT NOT NULL,
        FechaRegistro  DATETIME NOT NULL CONSTRAINT DF_GD_TA_Fecha DEFAULT (GETDATE()),
        FechaEdicion   DATETIME NULL,
        CONSTRAINT CK_GD_TA_Estado CHECK (Estado IN ('CONFIRMADO','IGNORADO')),
        CONSTRAINT CK_GD_TA_CodTienda CHECK (
            (Estado = 'IGNORADO' AND CodTienda IS NULL) OR (Estado = 'CONFIRMADO' AND CodTienda IS NOT NULL)),
        CONSTRAINT FK_GD_TA_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario)
    );
    CREATE UNIQUE INDEX UQ_GD_TA_NormRS1 ON dbo.GD_TiendaAlias(NormRS1) WHERE NormRS1 IS NOT NULL;
    CREATE UNIQUE INDEX UQ_GD_TA_NormRS2 ON dbo.GD_TiendaAlias(NormRS2) WHERE NormRS2 IS NOT NULL;
    CREATE INDEX IX_GD_TA_CodTienda ON dbo.GD_TiendaAlias(CodTienda);
    PRINT '✅ Tabla GD_TiendaAlias creada.';
END
ELSE
    PRINT '⏭  Tabla GD_TiendaAlias ya existe.';
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GD_TiendaAlias') AND name = 'GrupoExcel')
BEGIN
    ALTER TABLE dbo.GD_TiendaAlias ADD GrupoExcel NVARCHAR(120) NULL;
    PRINT '✅ Columna GrupoExcel agregada a GD_TiendaAlias.';
END
GO

-- ============================================================
-- 6f. GD_BancoAlias — mapeo fijo columna-Excel -> banco (ya resuelto,
--     sin pantalla de confirmación) + BANCO PROVINCIAL en el catálogo.
-- ============================================================
INSERT INTO dbo.GD_Banco (Nombre, Orden)
SELECT N'BANCO PROVINCIAL', (SELECT ISNULL(MAX(Orden), 0) + 1 FROM dbo.GD_Banco)
WHERE NOT EXISTS (SELECT 1 FROM dbo.GD_Banco WHERE Nombre = N'BANCO PROVINCIAL');
GO

IF OBJECT_ID('dbo.GD_BancoAlias','U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_BancoAlias (
        IdAlias       INT IDENTITY(1,1) PRIMARY KEY,
        ColumnaExcel  NVARCHAR(80) NOT NULL,
        ColumnaNorm   NVARCHAR(80) NOT NULL,
        IdBanco       INT NOT NULL,
        FechaCreacion DATETIME NOT NULL CONSTRAINT DF_GD_BA_Fecha DEFAULT (GETDATE()),
        CONSTRAINT UQ_GD_BA_ColumnaNorm UNIQUE (ColumnaNorm),
        CONSTRAINT FK_GD_BA_Banco FOREIGN KEY (IdBanco) REFERENCES dbo.GD_Banco(IdBanco)
    );
    PRINT '✅ Tabla GD_BancoAlias creada.';
END
ELSE
    PRINT '⏭  Tabla GD_BancoAlias ya existe.';
GO

INSERT INTO dbo.GD_BancoAlias (ColumnaExcel, ColumnaNorm, IdBanco)
SELECT v.ColumnaExcel, v.ColumnaNorm, b.IdBanco
FROM (VALUES
    (N'BANESCO (cta Principal) NUEVA',       N'BANESCO CTA PRINCIPAL NUEVA',        N'BANESCO'),
    (N'BANCO BANESCO C/H',                   N'BANCO BANESCO C H',                  N'BANESCO'),
    (N'BANCAMIGA',                           N'BANCAMIGA',                         N'BANCAMIGA'),
    (N'BANCO PROVINCIAL',                    N'BANCO PROVINCIAL',                  N'BANCO PROVINCIAL'),
    (N'BANCO DE VENEZUELA',                  N'BANCO DE VENEZUELA',                N'BANCO DE VENEZUELA'),
    (N'100% BANCO',                          N'100 BANCO',                         N'100% BANCO'),
    (N'BANCO BNC',                           N'BANCO BNC',                         N'BNC'),
    (N'BANCO BNC  CAJA CHICA',               N'BANCO BNC CAJA CHICA',              N'BNC'),
    (N'BANCO DELSUR',                        N'BANCO DELSUR',                      N'BANCO DEL SUR'),
    (N'BANCO MERCANTIL',                     N'BANCO MERCANTIL',                   N'BANCO MERCANTIL'),
    (N'BANCO DEL Tesoro (cta gastos) NUEVA', N'BANCO DEL TESORO CTA GASTOS NUEVA', N'BANCO DEL TESORO')
) AS v(ColumnaExcel, ColumnaNorm, NombreBanco)
JOIN dbo.GD_Banco b ON b.Nombre = v.NombreBanco
WHERE NOT EXISTS (SELECT 1 FROM dbo.GD_BancoAlias a WHERE a.ColumnaNorm = v.ColumnaNorm);
GO

-- ============================================================
-- 6g. Actualizar CHECK constraints — PAGO_EN_REVISION (v11)
--     Para instalaciones existentes donde las tablas ya existían:
--     los bloques CREATE TABLE arriba ya tienen los valores correctos,
--     pero si la tabla ya existía el bloque IF fue skipped. Estos ALTER
--     son idempotentes: siempre recrean el constraint al valor actual.
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FF_Estado')
    ALTER TABLE dbo.GD_FacturaFlujo DROP CONSTRAINT CK_GD_FF_Estado;
GO
ALTER TABLE dbo.GD_FacturaFlujo ADD CONSTRAINT CK_GD_FF_Estado CHECK (Estado IN (
    'PENDIENTE_ANALISTA','PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA',
    'PENDIENTE_PAGO','PAGO_EN_REVISION','PAGADO','APROBADO','RECHAZADO','DEVUELTO'));
PRINT '✅ CK_GD_FF_Estado actualizado (incluye PAGO_EN_REVISION).';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Etapa')
    ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Etapa;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Etapa CHECK (
    Etapa IN ('ANALISTA','TESORERIA','AUDITORIA','PAGADOR','AUDITOR_PAGO'));
PRINT '✅ CK_GD_FAp_Etapa actualizado (incluye AUDITOR_PAGO).';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Decision')
    ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Decision;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Decision CHECK (
    Decision IN ('APROBADO','RECHAZADO','DEVUELTO','PAGADO','PAGO_EN_REVISION','CONFIRMADO'));
PRINT '✅ CK_GD_FAp_Decision actualizado (incluye PAGO_EN_REVISION y CONFIRMADO).';
GO

-- ============================================================
-- 7. ADMIN inicial — resuelve el CODUSUARIO real desde GENERAL.USUARIOS.
--    Ajusta 'REDESIP' al login real del administrador en el servidor.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM dbo.GD_Usuario WHERE Rol = 'ADMIN')
BEGIN
    INSERT INTO dbo.GD_Usuario (CodUsuarioIcg, Usuario, Nombre, Rol)
    SELECT TOP 1 u.CODUSUARIO, LTRIM(RTRIM(u.USUARIO)), LTRIM(RTRIM(u.USUARIO)), 'ADMIN'
    FROM GENERAL.dbo.USUARIOS u
    WHERE LTRIM(RTRIM(u.USUARIO)) = 'REDESIP';

    IF @@ROWCOUNT > 0 PRINT '✅ Usuario REDESIP insertado como ADMIN.';
    ELSE PRINT '⚠  No se encontró el usuario REDESIP en GENERAL.USUARIOS — crea el ADMIN manualmente (ver plantilla abajo).';
END
ELSE
    PRINT '⏭  Ya existe al menos un ADMIN.';
GO

-- ============================================================
-- 7b. Compatibilidad de permisos por módulo — Saldos y Reportes dejaron de
--     otorgarse implícito por tener ANALISTA/TESORERIA/AUDITOR (ahora cada
--     módulo depende solo de su propio permiso). Para no quitarle acceso a
--     nadie que ya lo tenía implícito, se lo agrega explícito acá.
--     Idempotente: no lo vuelve a agregar si ya lo tiene.
-- ============================================================
UPDATE dbo.GD_Usuario
SET Rol = Rol + ',SALDOS'
WHERE (',' + Rol + ',' LIKE '%,ANALISTA,%' OR ',' + Rol + ',' LIKE '%,TESORERIA,%')
  AND ',' + Rol + ',' NOT LIKE '%,SALDOS,%'
  AND ',' + Rol + ',' NOT LIKE '%,ADMIN,%';
PRINT '✅ SALDOS preservado para usuarios ANALISTA/TESORERIA que no lo tenían.';
GO

UPDATE dbo.GD_Usuario
SET Rol = Rol + ',REPORTES'
WHERE (',' + Rol + ',' LIKE '%,ANALISTA,%' OR ',' + Rol + ',' LIKE '%,TESORERIA,%' OR ',' + Rol + ',' LIKE '%,AUDITOR,%')
  AND ',' + Rol + ',' NOT LIKE '%,REPORTES,%'
  AND ',' + Rol + ',' NOT LIKE '%,ADMIN,%';
PRINT '✅ REPORTES preservado para usuarios ANALISTA/TESORERIA/AUDITOR que no lo tenían.';
GO

-- ------------------------------------------------------------
-- PLANTILLA para asignar roles a usuarios reales de producción.
-- Descomenta y repite por cada persona. El CODUSUARIO se busca por
-- su login de ICG (GENERAL.USUARIOS.USUARIO). Roles válidos:
--   ANALISTA · TESORERIA · AUDITOR · PAGADOR · ADMIN
-- ------------------------------------------------------------
-- MERGE dbo.GD_Usuario AS t
-- USING (
--   SELECT u.CODUSUARIO AS Cod, LTRIM(RTRIM(u.USUARIO)) AS Usr, 'ANALISTA' AS Rol
--   FROM GENERAL.dbo.USUARIOS u WHERE LTRIM(RTRIM(u.USUARIO)) = 'NOMBRE_LOGIN_AQUI'
-- ) AS s
-- ON t.CodUsuarioIcg = s.Cod
-- WHEN MATCHED THEN UPDATE SET Rol = s.Rol, Activo = 1
-- WHEN NOT MATCHED THEN INSERT (CodUsuarioIcg, Usuario, Nombre, Rol) VALUES (s.Cod, s.Usr, s.Usr, s.Rol);
-- GO

-- ============================================================
-- 8. VERIFICACIÓN FINAL
-- ============================================================
SELECT t.name AS TABLA, SUM(p.rows) AS FILAS
FROM sys.tables t
INNER JOIN sys.indexes i    ON t.object_id = i.object_id AND i.index_id IN (0,1)
INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
WHERE t.name IN ('GD_Usuario','GD_UsuarioAmbito','GD_FacturaFlujo',
                 'GD_FacturaAdjunto','GD_FacturaAprobacion','GD_DispTienda',
                 'GD_Banco','GD_DispAjuste','GD_TiendaAlias','GD_BancoAlias')
GROUP BY t.name
ORDER BY t.name;
GO

SELECT Rol, COUNT(*) AS Usuarios FROM dbo.GD_Usuario GROUP BY Rol ORDER BY Rol;
GO

SELECT Nombre, Orden, Activo FROM dbo.GD_Banco ORDER BY Orden;
GO

SELECT COUNT(*) AS BancoAlias_Sembrados FROM dbo.GD_BancoAlias;
GO

PRINT '';
PRINT '============================================================';
PRINT ' Migración GASTOSGD completada. Verifica:';
PRINT '   • Deben listarse 10 tablas GD_*';
PRINT '   • Debe existir al menos 1 usuario ADMIN';
PRINT '   • Deben listarse 11 bancos en GD_Banco (incluye BANCO PROVINCIAL)';
PRINT '   • BancoAlias_Sembrados debe ser 11';
PRINT '   • CK_GD_FF_Estado debe incluir PAGO_EN_REVISION';
PRINT '   • CK_GD_FAp_Etapa debe incluir AUDITOR_PAGO';
PRINT '   • Asigna los demás roles con la plantilla del paso 7';
PRINT '============================================================';
