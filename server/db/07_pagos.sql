-- ============================================================
-- GastosGD 07 - Módulo de Pagos
-- Agrega estado PENDIENTE_PAGO, etapa PAGADOR y usuario demo.
-- El auditor ahora envía a PENDIENTE_PAGO (no a APROBADO).
-- El pagador sube comprobante obligatorio → estado PAGADO.
-- Idempotente.
-- ============================================================

-- Rol PAGADOR en GD_Usuario
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_Usuario_Rol')
  ALTER TABLE dbo.GD_Usuario DROP CONSTRAINT CK_GD_Usuario_Rol;
GO
ALTER TABLE dbo.GD_Usuario ADD CONSTRAINT CK_GD_Usuario_Rol CHECK (
  Rol IN ('ADMIN','ANALISTA','TESORERIA','AUDITOR','PAGADOR'));
GO

-- Estado: agregar PENDIENTE_PAGO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FF_Estado')
  ALTER TABLE dbo.GD_FacturaFlujo DROP CONSTRAINT CK_GD_FF_Estado;
GO
ALTER TABLE dbo.GD_FacturaFlujo ADD CONSTRAINT CK_GD_FF_Estado CHECK (Estado IN (
  'PENDIENTE_ANALISTA','PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA',
  'PENDIENTE_PAGO','PAGADO','APROBADO','RECHAZADO','DEVUELTO'));
GO

-- Etapa: agregar PAGADOR al historial
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Etapa')
  ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Etapa;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Etapa CHECK (
  Etapa IN ('ANALISTA','TESORERIA','AUDITORIA','PAGADOR'));
GO

-- Adjuntos: permitir tipo COMPROBANTE (el soporte de pago que sube el pagador)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FA_Tipo')
  ALTER TABLE dbo.GD_FacturaAdjunto DROP CONSTRAINT CK_GD_FA_Tipo;
GO
ALTER TABLE dbo.GD_FacturaAdjunto ADD CONSTRAINT CK_GD_FA_Tipo CHECK (
  Tipo IN ('FACTURA','SOPORTE','FOTO','OTRO','COMPROBANTE'));
GO

-- Historial: permitir Decision = PAGADO (la registra el pagador)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Decision')
  ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Decision;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Decision CHECK (
  Decision IN ('APROBADO','RECHAZADO','DEVUELTO','PAGADO'));
GO

-- Seed: usuario demo PAGADOR (primer usuario de GENERAL no reservado)
INSERT INTO dbo.GD_Usuario (CodUsuarioIcg, Nombre, Rol)
SELECT TOP 1 u.CODUSUARIO, LTRIM(RTRIM(u.USUARIO)), 'PAGADOR'
FROM GENERAL.dbo.USUARIOS u
WHERE u.BLOQUEADO <> 'T'
  AND ISNULL(u.DESCATALOGADO,'F') <> 'T'
  AND NOT EXISTS (SELECT 1 FROM dbo.GD_Usuario g WHERE g.CodUsuarioIcg = u.CODUSUARIO)
  AND NOT EXISTS (SELECT 1 FROM dbo.GD_Usuario g WHERE g.Rol = 'PAGADOR')
ORDER BY u.CODUSUARIO DESC;
GO
