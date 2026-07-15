-- ============================================================
-- GastosGD 11 - Estado PAGO_EN_REVISION
-- El PAGADOR sube el comprobante y la factura queda en
-- PAGO_EN_REVISION (no PAGADO directamente). El AUDITOR
-- revisa el comprobante y confirma → PAGADO definitivo, o
-- devuelve al pagador → PENDIENTE_PAGO para que lo corrija.
-- Idempotente.
-- ============================================================

-- Estado GD_FacturaFlujo: agregar PAGO_EN_REVISION
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FF_Estado')
  ALTER TABLE dbo.GD_FacturaFlujo DROP CONSTRAINT CK_GD_FF_Estado;
GO
ALTER TABLE dbo.GD_FacturaFlujo ADD CONSTRAINT CK_GD_FF_Estado CHECK (Estado IN (
  'PENDIENTE_ANALISTA','PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA',
  'PENDIENTE_PAGO','PAGO_EN_REVISION','PAGADO','APROBADO','RECHAZADO','DEVUELTO'));
GO

-- Etapa en GD_FacturaAprobacion: agregar AUDITOR_PAGO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Etapa')
  ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Etapa;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Etapa CHECK (
  Etapa IN ('ANALISTA','TESORERIA','AUDITORIA','PAGADOR','AUDITOR_PAGO'));
GO

-- Decision en GD_FacturaAprobacion: agregar PAGO_EN_REVISION y CONFIRMADO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Decision')
  ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Decision;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Decision CHECK (
  Decision IN ('APROBADO','RECHAZADO','DEVUELTO','PAGADO','PAGO_EN_REVISION','CONFIRMADO'));
GO
