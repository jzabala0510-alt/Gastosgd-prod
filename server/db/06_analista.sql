-- ============================================================
-- GastosGD v2.1 - Etapa ANALISTA antes de Tesorería
-- Las facturas entran como PENDIENTE_ANALISTA; el analista las
-- aprueba (-> PENDIENTE_TESORERIA). Idempotente.
-- ============================================================

-- Estado: permitir PENDIENTE_ANALISTA
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FF_Estado')
  ALTER TABLE dbo.GD_FacturaFlujo DROP CONSTRAINT CK_GD_FF_Estado;
GO
ALTER TABLE dbo.GD_FacturaFlujo ADD CONSTRAINT CK_GD_FF_Estado CHECK (Estado IN
  ('PENDIENTE_ANALISTA','PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA','APROBADO','RECHAZADO','DEVUELTO','PAGADO'));
GO

-- Default = PENDIENTE_ANALISTA
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_GD_FF_Estado')
  ALTER TABLE dbo.GD_FacturaFlujo DROP CONSTRAINT DF_GD_FF_Estado;
GO
ALTER TABLE dbo.GD_FacturaFlujo ADD CONSTRAINT DF_GD_FF_Estado DEFAULT ('PENDIENTE_ANALISTA') FOR Estado;
GO

-- Etapa ANALISTA en el historial
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_GD_FAp_Etapa')
  ALTER TABLE dbo.GD_FacturaAprobacion DROP CONSTRAINT CK_GD_FAp_Etapa;
GO
ALTER TABLE dbo.GD_FacturaAprobacion ADD CONSTRAINT CK_GD_FAp_Etapa CHECK (Etapa IN ('ANALISTA','TESORERIA','AUDITORIA'));
GO

-- Demo: marcar algunas facturas de la tienda 288 como ya aprobadas por el analista
-- (PENDIENTE_TESORERIA) para que la bandeja de Tesorería tenga contenido.
INSERT INTO dbo.GD_FacturaFlujo (CodTienda, Marca, NumSerie, NumFactura, N, Estado)
SELECT TOP 5 288, 'ARDENE', f.NUMSERIE, f.NUMFACTURA, f.N, 'PENDIENTE_TESORERIA'
FROM dbo.FACTURASCOMPRA f
WHERE f.ENLACE_EMPRESA = 288
  AND NOT EXISTS (SELECT 1 FROM dbo.GD_FacturaFlujo ff
                  WHERE ff.CodTienda = 288
                    AND ff.NumSerie = f.NUMSERIE COLLATE DATABASE_DEFAULT
                    AND ff.NumFactura = f.NUMFACTURA
                    AND ff.N = f.N COLLATE DATABASE_DEFAULT)
ORDER BY f.FECHA DESC;
GO
