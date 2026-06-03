-- =============================================================
-- MIGRACIÓN: Créditos, pagos, bioaplicaciones
-- Ejecutar UNA SOLA VEZ en Railway → Postgres → pestaña Query
-- =============================================================

-- 1. Columna credito_activo en clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS credito_activo INTEGER DEFAULT 0;

-- 2. Tabla pagos_credito
CREATE TABLE IF NOT EXISTS pagos_credito (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  numero_pago INTEGER NOT NULL,
  monto REAL NOT NULL DEFAULT 0,
  fecha_vencimiento TEXT NOT NULL,
  fecha_pago TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  metodo_pago TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Nuevas columnas en biofabrica_lotes
ALTER TABLE biofabrica_lotes ADD COLUMN IF NOT EXISTS cantidad_producida REAL DEFAULT 0;
ALTER TABLE biofabrica_lotes ADD COLUMN IF NOT EXISTS cantidad_disponible REAL DEFAULT 0;
ALTER TABLE biofabrica_lotes ADD COLUMN IF NOT EXISTS unidad TEXT DEFAULT 'litros';
ALTER TABLE biofabrica_lotes ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE biofabrica_lotes ADD COLUMN IF NOT EXISTS notas TEXT;

-- 4. Tabla aplicaciones_bioinsumo
CREATE TABLE IF NOT EXISTS aplicaciones_bioinsumo (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES biofabrica_lotes(id) ON DELETE CASCADE,
  planta_id INTEGER NOT NULL REFERENCES plantas(id),
  cantidad_aplicada REAL NOT NULL DEFAULT 0,
  fecha_aplicacion TEXT NOT NULL,
  responsable TEXT,
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Activar crédito para 2 clientes
UPDATE clientes SET credito_activo = 1 WHERE id IN (1, 2);

-- 6. Calcular límites por historial (promedio últimas 3 compras * 3)
UPDATE clientes c SET limite_credito = (
  SELECT COALESCE(ROUND(AVG(v.total) * 3, 2), 0)
  FROM (
    SELECT v.total FROM ventas v
    WHERE v.cliente_id = c.id AND v.estado != 'Cancelado'
    ORDER BY v.created_at DESC LIMIT 3
  ) sub
) WHERE c.credito_activo = 1;

-- 7. Actualizar lotes existentes con cantidades
UPDATE biofabrica_lotes SET cantidad_producida = 50, cantidad_disponible = 35, unidad = 'litros', responsable = 'Luis Torres', notas = 'Lote estándar de control biológico' WHERE lote_id = 'L-2024-001';
UPDATE biofabrica_lotes SET cantidad_producida = 30, cantidad_disponible = 30, unidad = 'kg', responsable = 'Luis Torres', notas = 'Lote en proceso de maduración' WHERE lote_id = 'L-2024-002';
UPDATE biofabrica_lotes SET cantidad_producida = 20, cantidad_disponible = 5, unidad = 'unidades', responsable = 'Ana Gómez', notas = 'Lote próximo a vencer' WHERE lote_id = 'L-2024-003';

-- 8. Aplicaciones ficticias
INSERT INTO aplicaciones_bioinsumo (lote_id, planta_id, cantidad_aplicada, fecha_aplicacion, responsable, notas) VALUES
(1, 1, 5, '2026-06-10', 'Luis Torres', 'Aplicación preventiva contra hongos en rosas'),
(1, 2, 3, '2026-06-12', 'Luis Torres', 'Control de plaga en ficus'),
(2, 3, 10, '2026-06-15', 'Ana Gómez', 'Fertilización biológica agave');

-- 9. Ventas a crédito ficticias (usuario_id=1 admin, cliente_id=1 Maria)
INSERT INTO ventas (folio, cliente_id, total, metodo_pago, usuario_id, estado, tipo_venta, anticipo, saldo_pendiente, created_at)
VALUES ('F-9991', 1, 600, 'Crédito', 1, 'Pendiente', 'Crédito', 0, 600, NOW());

INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal)
VALUES (4, 'planta', 5, 'Pothos', 4, 85, 340);
INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal)
VALUES (4, 'planta', 7, 'Peperomia', 2, 75, 150);
INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal)
VALUES (4, 'planta', 14, 'Aloe Vera', 1, 90, 90);

-- Pagos semanales para venta 4 (vencimiento en 2 días y ya vencido)
INSERT INTO pagos_credito (venta_id, cliente_id, numero_pago, monto, fecha_vencimiento, estado) VALUES
(4, 1, 1, 150, to_char(CURRENT_DATE + INTERVAL '2 days', 'YYYY-MM-DD'), 'pendiente'),
(4, 1, 2, 150, to_char(CURRENT_DATE + INTERVAL '9 days', 'YYYY-MM-DD'), 'pendiente'),
(4, 1, 3, 150, to_char(CURRENT_DATE + INTERVAL '16 days', 'YYYY-MM-DD'), 'pendiente'),
(4, 1, 4, 150, to_char(CURRENT_DATE + INTERVAL '23 days', 'YYYY-MM-DD'), 'pendiente');

-- Venta 5: cliente 2 (Pedro) - ya vencida
INSERT INTO ventas (folio, cliente_id, total, metodo_pago, usuario_id, estado, tipo_venta, anticipo, saldo_pendiente, created_at)
VALUES ('F-9992', 2, 320, 'Crédito', 2, 'Pendiente', 'Crédito', 0, 320, NOW() - INTERVAL '15 days');

INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal)
VALUES (5, 'planta', 2, 'Ficus Benjamina', 1, 320, 320);

-- Pagos quincenales para venta 5 (primer pago ya vencido)
INSERT INTO pagos_credito (venta_id, cliente_id, numero_pago, monto, fecha_vencimiento, estado) VALUES
(5, 2, 1, 160, to_char(CURRENT_DATE - INTERVAL '3 days', 'YYYY-MM-DD'), 'vencido'),
(5, 2, 2, 160, to_char(CURRENT_DATE + INTERVAL '12 days', 'YYYY-MM-DD'), 'pendiente');

-- 10. Actualizar saldo_pendiente en ventas credito
UPDATE ventas SET saldo_pendiente = total - COALESCE(anticipo, 0) WHERE tipo_venta = 'Crédito';
