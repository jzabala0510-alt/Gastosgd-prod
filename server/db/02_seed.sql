-- ============================================================
-- GastosGD - Datos semilla (idempotente via MERGE)
-- ============================================================

-- Categorias de gasto base
MERGE dbo.GD_CategoriaGasto AS t
USING (VALUES
  (N'Alquiler / Condominio'),
  (N'Servicios (luz, agua, internet)'),
  (N'Nomina y honorarios'),
  (N'Mantenimiento y reparaciones'),
  (N'Limpieza e insumos'),
  (N'Papeleria y oficina'),
  (N'Publicidad y mercadeo'),
  (N'Fletes y transporte'),
  (N'Impuestos y tasas'),
  (N'Viaticos'),
  (N'Otros')
) AS s(Nombre)
ON t.Nombre = s.Nombre
WHEN NOT MATCHED THEN INSERT (Nombre) VALUES (s.Nombre);
GO
