const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vivero.db');
let db = null;
let SQL = null;

async function getDB() {
  if (db) return db;

  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  return db;
}

function saveDB() {
  if (db) {
    const data = db.export();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  let sqlToRun = sql;
  if (params.length > 0) {
    const esc = v => { if (v === null || v === undefined) return 'NULL'; if (typeof v === 'number') return v; return "'" + String(v).replace(/'/g,"''") + "'"; };
    let idx = 0;
    sqlToRun = sql.replace(/\?/g, () => esc(params[idx++]));
  }
  // Capturar last_insert_rowid ANTES de exportar (sql.js resetea con export)
  const wasInsert = /^\s*INSERT\s/i.test(sqlToRun);
  db.exec(sqlToRun);
  const lastId = wasInsert ? (db.exec('SELECT last_insert_rowid() as id')?.[0]?.values?.[0]?.[0] ?? null) : null;
  const modified = db.getRowsModified();
  saveDB();
  return { changes: modified, lastId };
}

function lastInsertId() {
  // NOTA: debe llamarse ANTES de saveDB() — ahora execute() lo captura
  const r = db.exec('SELECT last_insert_rowid() as id');
  return (r && r.length > 0 && r[0].values.length > 0) ? r[0].values[0][0] || null : null;
}

// ============ HELPERS EXPORTADOS ============
async function initDatabase() {
  const db = await getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'Vendedor',
      activo INTEGER NOT NULL DEFAULT 1,
      permisos TEXT DEFAULT '{}',
      ultimo_acceso TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'Particular',
      telefono TEXT,
      email TEXT,
      rfc TEXT,
      limite_credito REAL DEFAULT 0,
      direccion TEXT,
      saldo_actual REAL DEFAULT 0,
      compras_totales INTEGER DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS plantas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      nombre_cientifico TEXT,
      categoria TEXT NOT NULL,
      precio REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 10,
      descripcion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS herramientas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'Disponible',
      responsable TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS biofabrica_lotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_id TEXT UNIQUE NOT NULL,
      producto TEXT NOT NULL,
      fecha_inicio TEXT NOT NULL,
      fecha_vencimiento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'En proceso',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS personal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      puesto TEXT NOT NULL,
      area TEXT NOT NULL,
      turno TEXT NOT NULL DEFAULT 'Matutino',
      estado TEXT NOT NULL DEFAULT 'Activo',
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT UNIQUE NOT NULL,
      cliente_id INTEGER,
      total REAL NOT NULL DEFAULT 0,
      metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
      usuario_id INTEGER,
      estado TEXT NOT NULL DEFAULT 'Pagado',
      tipo_venta TEXT NOT NULL DEFAULT 'Normal',
      anticipo REAL NOT NULL DEFAULT 0,
      saldo_pendiente REAL NOT NULL DEFAULT 0,
      fecha_programada TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS ventas_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_tipo TEXT NOT NULL,
      producto_id INTEGER NOT NULL,
      producto_nombre TEXT NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_tipo TEXT NOT NULL,
      producto_id INTEGER NOT NULL,
      stock_actual INTEGER NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 10,
      ultima_actualizacion TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(producto_tipo, producto_id)
    );

    CREATE TABLE IF NOT EXISTS inventario_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventario_id INTEGER,
      producto_tipo TEXT NOT NULL,
      producto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      motivo TEXT,
      usuario_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT,
      telefono TEXT,
      email TEXT,
      producto_principal TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS calidad_inspecciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lote_producto TEXT NOT NULL,
      inspector TEXT NOT NULL,
      fecha TEXT NOT NULL,
      estado_fitosanitario TEXT NOT NULL,
      calificacion INTEGER NOT NULL DEFAULT 5,
      observaciones TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS adquisicion_plantas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT UNIQUE NOT NULL,
      proveedor TEXT NOT NULL,
      fecha_adquisicion TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'Recibido',
      observaciones TEXT,
      usuario_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS adquisicion_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adquisicion_id INTEGER NOT NULL,
      planta_id INTEGER NOT NULL,
      variedad TEXT,
      cantidad INTEGER NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (adquisicion_id) REFERENCES adquisicion_plantas(id) ON DELETE CASCADE,
      FOREIGN KEY (planta_id) REFERENCES plantas(id)
    );

    CREATE TABLE IF NOT EXISTS facturacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      folio_fiscal TEXT,
      rfc TEXT,
      razon_social TEXT,
      uso_cfdi TEXT,
      regimen_fiscal_receptor TEXT,
      codigo_postal TEXT,
      uuid TEXT,
      fecha_timbrado TEXT,
      cfdi_estado TEXT NOT NULL DEFAULT 'Pendiente',
      datos_fiscales TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (venta_id) REFERENCES ventas(id)
    );

  `);

  // Migraciones para tablas existentes
  try { db.run('ALTER TABLE ventas ADD COLUMN tipo_venta TEXT NOT NULL DEFAULT \'Normal\''); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE ventas ADD COLUMN anticipo REAL NOT NULL DEFAULT 0'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE ventas ADD COLUMN saldo_pendiente REAL NOT NULL DEFAULT 0'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE ventas ADD COLUMN fecha_programada TEXT'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE facturacion ADD COLUMN datos_fiscales TEXT'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE facturacion ADD COLUMN uuid TEXT'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE facturacion ADD COLUMN fecha_timbrado TEXT'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE facturacion ADD COLUMN uso_cfdi TEXT'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE facturacion ADD COLUMN regimen_fiscal_receptor TEXT'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE facturacion ADD COLUMN codigo_postal TEXT'); } catch (e) { /* ya existe */ }
  try { db.run('ALTER TABLE facturacion ADD COLUMN razon_social TEXT'); } catch (e) { /* ya existe */ }

  seedData();
  saveDB();
  return db;
}

function seedData() {
  const count = queryOne('SELECT COUNT(*) as c FROM usuarios');
  if (count && count.c > 0) return;

  const hash = bcrypt.hashSync('Admin123!', 10);
  execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Administrador', 'admin', hash, 'Administrador']);

  const hash4 = bcrypt.hashSync('Vendedor123!', 10);
  execute('INSERT INTO usuarios (nombre, username, password, rol) VALUES (?,?,?,?)', ['Carlos Ruiz', 'vendedor', hash4, 'Vendedor']);

  execute("INSERT INTO clientes (nombre, tipo, telefono, email, rfc, limite_credito, compras_totales) VALUES (?,?,?,?,?,?,?)", ['María Sánchez', 'Particular', '228-111-2233', 'maria@email.com', 'SAMA890101', 5000, 8]);
  execute("INSERT INTO clientes (nombre, tipo, telefono, email, rfc, limite_credito, compras_totales) VALUES (?,?,?,?,?,?,?)", ['Pedro López', 'Particular', '228-444-5566', 'pedro@mail.com', 'LOPP750203', 3000, 3]);
  execute("INSERT INTO clientes (nombre, tipo, telefono, email, rfc, limite_credito, compras_totales) VALUES (?,?,?,?,?,?,?)", ['Jardines SA de CV', 'Empresa', '228-999-0011', 'jardines@empresa.mx', 'JSA880505', 50000, 22]);

  execute("INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, stock, stock_minimo, descripcion) VALUES (?,?,?,?,?,?,?)", ['Rosa Roja', 'Rosa rubiginosa', 'Flor', 85, 3, 20, 'Rosa roja clásica']);
  execute("INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, stock, stock_minimo, descripcion) VALUES (?,?,?,?,?,?,?)", ['Ficus Benjamina', 'Ficus benjamina', 'Árbol', 320, 45, 10, 'Árbol ornamental']);
  execute("INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, stock, stock_minimo, descripcion) VALUES (?,?,?,?,?,?,?)", ['Agave Azul', 'Agave tequilana', 'Suculenta', 150, 28, 5, 'Agave para mezcal']);
  execute("INSERT INTO plantas (nombre, nombre_cientifico, categoria, precio, stock, stock_minimo, descripcion) VALUES (?,?,?,?,?,?,?)", ['Buganvilia Morada', 'Bougainvillea glabra', 'Arbusto', 120, 0, 15, 'Arbusto trepador']);

  execute("INSERT INTO herramientas (nombre, categoria, estado, responsable) VALUES (?,?,?,?)", ['Podadora Stihl', 'Corte', 'En mantenimiento', 'Ana Gómez']);
  execute("INSERT INTO herramientas (nombre, categoria, estado, responsable) VALUES (?,?,?,?)", ['Regadera 10L', 'Riego', 'Disponible', null]);
  execute("INSERT INTO herramientas (nombre, categoria, estado, responsable) VALUES (?,?,?,?)", ['Motocultor Honda', 'Labranza', 'En uso', 'Carlos Ruiz']);

  execute("INSERT INTO biofabrica_lotes (lote_id, producto, fecha_inicio, fecha_vencimiento, estado) VALUES (?,?,?,?,?)", ['L-2024-001', 'Trichoderma', '2024-01-10', '2024-07-10', 'Listo']);
  execute("INSERT INTO biofabrica_lotes (lote_id, producto, fecha_inicio, fecha_vencimiento, estado) VALUES (?,?,?,?,?)", ['L-2024-002', 'Bacillus subtilis', '2024-02-01', '2024-08-01', 'En proceso']);
  execute("INSERT INTO biofabrica_lotes (lote_id, producto, fecha_inicio, fecha_vencimiento, estado) VALUES (?,?,?,?,?)", ['L-2024-003', 'Micorriza', '2024-03-15', '2024-06-15', 'Por vencer']);

  execute("INSERT INTO personal (nombre, puesto, area, turno, estado) VALUES (?,?,?,?,?)", ['Roberto Hernández', 'Jardinero', 'Campo', 'Matutino', 'Activo']);
  execute("INSERT INTO personal (nombre, puesto, area, turno, estado) VALUES (?,?,?,?,?)", ['Sofía Martínez', 'Vendedora', 'Tienda', 'Vespertino', 'Activo']);
  execute("INSERT INTO personal (nombre, puesto, area, turno, estado) VALUES (?,?,?,?,?)", ['Luis Torres', 'Técnico', 'Biofábrica', 'Matutino', 'Vacaciones']);

  execute("INSERT INTO ventas (folio, cliente_id, total, metodo_pago, usuario_id, estado) VALUES (?,?,?,?,?,?)", ['F-0048', 1, 425, 'Efectivo', 1, 'Pagado']);
  execute("INSERT INTO ventas (folio, cliente_id, total, metodo_pago, usuario_id, estado) VALUES (?,?,?,?,?,?)", ['F-0047', 2, 780, 'Tarjeta', 2, 'Pagado']);
  execute("INSERT INTO ventas (folio, cliente_id, total, metodo_pago, usuario_id, estado) VALUES (?,?,?,?,?,?)", ['F-0046', 3, 3000, 'Transferencia', 1, 'Crédito']);

  execute("INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?,?)", [1, 'planta', 1, 'Rosa Roja', 5, 85, 425]);
  execute("INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?,?)", [2, 'planta', 2, 'Ficus Benjamina', 2, 320, 640]);
  execute("INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?,?)", [2, 'planta', 4, 'Buganvilia Morada', 1, 120, 120]);
  execute("INSERT INTO ventas_detalle (venta_id, producto_tipo, producto_id, producto_nombre, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?,?)", [3, 'planta', 3, 'Agave Azul', 20, 150, 3000]);

  execute("INSERT INTO proveedores (nombre, contacto, telefono, email, producto_principal) VALUES (?,?,?,?,?)", ['Plantas del Golfo SA', 'Carlos Mendoza', '222-333-4444', 'ventas@plantasgolfo.mx', 'Flores tropicales']);
  execute("INSERT INTO proveedores (nombre, contacto, telefono, email, producto_principal) VALUES (?,?,?,?,?)", ['Insumos Agrícolas MX', 'Laura Rivas', '333-444-5555', 'pedidos@insumosagri.mx', 'Sustratos y fertilizantes']);
  execute("INSERT INTO proveedores (nombre, contacto, telefono, email, producto_principal) VALUES (?,?,?,?,?)", ['Herramientas Pro', 'Pedro Sánchez', '444-555-6666', 'ventas@herramientaspro.mx', 'Herramientas de jardinería']);

  execute("INSERT INTO calidad_inspecciones (lote_producto, inspector, fecha, estado_fitosanitario, calificacion, observaciones) VALUES (?,?,?,?,?,?)", ['Rosa Roja — Lote A', 'Ana Gómez', '2024-05-15', 'Sano', 5, 'Excelente estado']);
  execute("INSERT INTO calidad_inspecciones (lote_producto, inspector, fecha, estado_fitosanitario, calificacion, observaciones) VALUES (?,?,?,?,?,?)", ['Ficus — Lote B', 'Ana Gómez', '2024-05-12', 'Plaga leve', 3, 'Requiere tratamiento']);
  execute("INSERT INTO calidad_inspecciones (lote_producto, inspector, fecha, estado_fitosanitario, calificacion, observaciones) VALUES (?,?,?,?,?,?)", ['Agave — Lote C', 'Luis Torres', '2024-05-10', 'Sano', 4, 'Buen desarrollo']);

  execute("INSERT INTO facturacion (venta_id, folio_fiscal, rfc, cfdi_estado) VALUES (?,?,?,?)", [1, 'CFDI-0048', 'SAMA890101', 'Emitido']);
  execute("INSERT INTO facturacion (venta_id, folio_fiscal, rfc, cfdi_estado) VALUES (?,?,?,?)", [2, null, null, 'Pendiente']);
  execute("INSERT INTO facturacion (venta_id, folio_fiscal, rfc, cfdi_estado) VALUES (?,?,?,?)", [3, 'CFDI-0046', 'JSA880505', 'Emitido']);

  execute("INSERT INTO inventario (producto_tipo, producto_id, stock_actual, stock_minimo) VALUES (?,?,?,?)", ['planta', 1, 3, 20]);
  execute("INSERT INTO inventario (producto_tipo, producto_id, stock_actual, stock_minimo) VALUES (?,?,?,?)", ['planta', 2, 45, 10]);
  execute("INSERT INTO inventario (producto_tipo, producto_id, stock_actual, stock_minimo) VALUES (?,?,?,?)", ['planta', 3, 28, 5]);
  execute("INSERT INTO inventario (producto_tipo, producto_id, stock_actual, stock_minimo) VALUES (?,?,?,?)", ['planta', 4, 0, 15]);
}

module.exports = { getDB, initDatabase, query, queryOne, execute, lastInsertId };
