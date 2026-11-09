/* =============================================================================
   GastosGD · Seguimiento de ICG (saldado / reabierto / transferido de mayores)
   Correr en SSMS sobre la BD de la app (GASTOSGD) ANTES de actualizar la app.
   Se puede correr más de una vez: cada bloque revisa si ya está aplicado.

   Qué hace:
     6g. Recrea los CHECK de estados y del historial con los valores nuevos:
         estado TRANSFERIDO; etapa SISTEMA; decisiones SALDADO_ICG, REABIERTO_ICG,
         TRANSFERIDO y TRANSFERIDO_ICG.
     6h. Historial con eventos automáticos (IdUsuario acepta NULL) y columnas
         IcgEstado / IcgSaldadoFecha / IcgTipoPago en GD_FacturaFlujo.
     6i. GD_FacturaAdjunto.Anulado / FechaAnulado y GD_FacturaFlujo.IcgTransferidoA.

   No borra ni modifica datos existentes. Estos mismos bloques están en
   migracion_servidor.sql (6g, 6h y 6i).
   ============================================================================= */
USE GASTOSGD;
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
    'PENDIENTE_PAGO','PAGO_EN_REVISION','PAGADO','APROBADO','RECHAZADO','DEVUELTO','TRANSFERIDO'));
PRINT '✅ CK_GD_FF_Estado actualizado (incluye PAGO_EN_REVISION y TRANSFERIDO).';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Etapa')
    ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Etapa;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Etapa CHECK (
    Etapa IN ('ANALISTA','TESORERIA','AUDITORIA','PAGADOR','AUDITOR_PAGO','SISTEMA'));
PRINT '✅ CK_GD_FAp_Etapa actualizado (incluye AUDITOR_PAGO y SISTEMA).';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Decision')
    ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Decision;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Decision CHECK (
    Decision IN ('APROBADO','RECHAZADO','DEVUELTO','PAGADO','PAGO_EN_REVISION','CONFIRMADO',
                 'SALDADO_ICG','REABIERTO_ICG','TRANSFERIDO','TRANSFERIDO_ICG'));
PRINT '✅ CK_GD_FAp_Decision actualizado (incluye eventos del sistema: SALDADO_ICG, REABIERTO_ICG, TRANSFERIDO, TRANSFERIDO_ICG).';
GO

-- ============================================================
-- 6h. Seguimiento de ICG (saldado / reabierto / transferido)
--     El historial acepta eventos automáticos del sistema: Etapa SISTEMA y sin usuario.
--     En GD_FacturaFlujo, lo último que se vio en ICG del gasto: P (pendiente) o S (saldado),
--     y la fecha y el tipo de pago del saldado. Lo llena seguimientoIcg.service.js.
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GD_FacturaAprobacion') AND name = 'IdUsuario' AND is_nullable = 0)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GD_FAp_Usuario')
        ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT FK_GD_FAp_Usuario;
    ALTER TABLE dbo.GD_FacturaAprobacion ALTER COLUMN IdUsuario INT NULL;
    ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT FK_GD_FAp_Usuario FOREIGN KEY (IdUsuario) REFERENCES dbo.GD_Usuario(IdUsuario);
    PRINT '✅ GD_FacturaAprobacion.IdUsuario acepta NULL (eventos del sistema).';
END
GO

IF COL_LENGTH('dbo.GD_FacturaFlujo', 'IcgEstado') IS NULL
BEGIN
    ALTER TABLE dbo.GD_FacturaFlujo ADD
        IcgEstado       CHAR(1)      NULL,   -- P = pendiente en ICG, S = saldado en ICG
        IcgSaldadoFecha DATETIME     NULL,   -- FECHASALDADO del último saldado visto
        IcgTipoPago     NVARCHAR(60) NULL;   -- tipo de pago de ese saldado (TIPOSPAGO)
    PRINT '✅ Columnas de seguimiento de ICG agregadas a GD_FacturaFlujo.';
END
GO

-- ============================================================
-- 6i. Seguimiento de ICG, fases 2 y 3 (reabiertos y transferidos de mayores)
--     GD_FacturaAdjunto.Anulado: comprobante de un pago que ICG reabrió (el gasto
--     volvió a Pagos); se conserva como historial pero ya no vale como comprobante.
--     GD_FacturaFlujo.IcgTransferidoA: en un gasto de mayores (TOP GROUP / MAYORES), la
--     factura de la tienda a la que se transfirió en ICG (JSON). Lo llena
--     traspasosMayores.service.js.
-- ============================================================
IF COL_LENGTH('dbo.GD_FacturaAdjunto', 'Anulado') IS NULL
BEGIN
    ALTER TABLE dbo.GD_FacturaAdjunto ADD
        Anulado      BIT      NOT NULL CONSTRAINT DF_GD_FA_Anulado DEFAULT (0),
        FechaAnulado DATETIME NULL;
    PRINT '✅ Columnas Anulado/FechaAnulado agregadas a GD_FacturaAdjunto.';
END
GO

IF COL_LENGTH('dbo.GD_FacturaFlujo', 'IcgTransferidoA') IS NULL
BEGIN
    ALTER TABLE dbo.GD_FacturaFlujo ADD IcgTransferidoA NVARCHAR(400) NULL;
    PRINT '✅ Columna IcgTransferidoA agregada a GD_FacturaFlujo.';
END
GO

PRINT '✅ Seguimiento de ICG: base de datos lista.';
GO
