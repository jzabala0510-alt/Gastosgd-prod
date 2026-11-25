/* =============================================================================
   GastosGD · Actualización de noviembre 2026 (segunda entrega)
   Correr en SSMS sobre la BD de la app (GASTOSGD) ANTES de actualizar la app.
   Se puede correr más de una vez: cada bloque revisa si ya está aplicado.

     6j. GD_FacturaFlujo.PagadoPor: "Se paga por" (la tienda o una mayor).
     6k. Tabla GD_UsuarioTipoGasto: tipos de gasto que ve cada usuario (sin filas = todos).
     6l. GD_FacturaAdjunto.IdUsuario: quién subió cada soporte (Auditoría de usuarios).

   No borra ni modifica datos existentes. Estos mismos bloques están en
   migracion_servidor.sql (6j, 6k y 6l).
   ============================================================================= */
USE GASTOSGD;
GO

-- ============================================================
-- 6j. "Se paga por": empresa que paga el gasto (la propia tienda o una mayor). La elige el
--     Analista al meter el gasto al flujo. codTienda de GastosGD de esa empresa.
-- ============================================================
IF COL_LENGTH('dbo.GD_FacturaFlujo', 'PagadoPor') IS NULL
BEGIN
    ALTER TABLE dbo.GD_FacturaFlujo ADD PagadoPor INT NULL;
    PRINT '✅ Columna PagadoPor agregada a GD_FacturaFlujo.';
END
GO

-- ============================================================
-- 6k. Permisos por tipo de gasto: qué tipos de gasto (campo libre TIPOGASTOS de ICG, en
--     mayúsculas) ve cada usuario en bandejas, Archivo y Reportes. Sin filas = todos.
-- ============================================================
IF OBJECT_ID('dbo.GD_UsuarioTipoGasto', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.GD_UsuarioTipoGasto (
        IdUsuario INT           NOT NULL,
        TipoGasto NVARCHAR(100) NOT NULL,
        CONSTRAINT PK_GD_UsuarioTipoGasto PRIMARY KEY (IdUsuario, TipoGasto),
        CONSTRAINT FK_GD_UTG_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario) ON DELETE CASCADE
    );
    PRINT '✅ Tabla GD_UsuarioTipoGasto creada.';
END
GO

-- ============================================================
-- 6l. Auditoría de usuarios: quién subió cada soporte (desde este cambio; los anteriores
--     quedan sin usuario).
-- ============================================================
IF COL_LENGTH('dbo.GD_FacturaAdjunto', 'IdUsuario') IS NULL
BEGIN
    ALTER TABLE dbo.GD_FacturaAdjunto ADD IdUsuario INT NULL;
    PRINT '✅ Columna IdUsuario agregada a GD_FacturaAdjunto.';
END
GO

PRINT '✅ Actualización noviembre 2026 (entrega 2): base de datos lista.';
GO
