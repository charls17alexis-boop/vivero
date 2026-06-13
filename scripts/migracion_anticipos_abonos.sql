-- Migración para Anticipos y Abonos a Créditos
-- Ejecutar en Railway → Postgres → pestaña Query

CREATE TABLE IF NOT EXISTS anticipos (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id),
    vendedor_id INTEGER REFERENCES usuarios(id),
    productos TEXT NOT NULL,
    total_venta REAL NOT NULL DEFAULT 0,
    monto_anticipo REAL NOT NULL DEFAULT 0,
    saldo_pendiente REAL NOT NULL DEFAULT 0,
    fecha_limite TEXT NOT NULL,
    metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS abonos_credito (
    id SERIAL PRIMARY KEY,
    venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    monto REAL NOT NULL DEFAULT 0,
    metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
    fecha TEXT NOT NULL,
    numero_pago INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);
