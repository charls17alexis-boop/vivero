# Sesión — 13 Jun 2026

## Estado del Proyecto
Sistema integral de gestión de vivero funcional en producción.

## URLs
- **Local:** http://localhost:3000
- **Railway:** https://vivero-production-7be4.up.railway.app
- **GitHub:** https://github.com/charls17alexis-boop/vivero

## Usuarios
| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | Admin123! | Administrador |
| vendedor | Vendedor123! | Vendedor |
| laura | Vendedor123! | Vendedor |

## Base de Datos
- Railway usa PostgreSQL compartido entre local y producción via `DATABASE_URL` en `.env`
- SQLite local si no hay `.env` (para pruebas offline)
- `database.js` contiene función `fixSQL()` que convierte SQLite → PostgreSQL automáticamente

## Últimas Implementaciones (13 Jun 2026)

### 1. Bug de Validación de Stock en Nueva Venta
- **Frontend**: Al guardar, agrupa todas las líneas por `producto_id`, suma cantidades totales y valida vs stock disponible. Mensaje: "Rosa Roja: solicitando 20 unidades pero solo hay 10 disponibles".
- **Backend**: Misma lógica de agrupación en POST `/api/ventas` antes de descontar stock.
- **Advertencia visual**: Si el mismo producto aparece en dos filas, muestra advertencia amarilla debajo del producto duplicado: "Rosa Roja ya está en la lista. Considera consolidar las líneas."
- Arreglado bug de template literal con backticks en frontend (se usaban `${}` dentro de string normal).

### 2. Sistema de Anticipos (Apartados)
- **Nueva tabla `anticipos`**: SQLite y PostgreSQL. Campos: id, cliente_id, vendedor_id, productos (JSON), total_venta, monto_anticipo, saldo_pendiente, fecha_limite, metodo_pago, estado (pendiente/liquidado/cancelado), created_at.
- **Formulario de venta**: Al seleccionar "Anticipo" se muestran campos: monto anticipo, método pago (efectivo/transferencia), fecha límite (máx 30 días).
- **No descuenta stock** al registrar anticipo. Solo se descuenta al liquidar.
- **Ticket PDF de anticipo**: Cliente, productos apartados, monto anticipo, saldo pendiente, fecha límite.
- **Liquidación**: Modal con monto restante y método de pago. Al liquidar: descuenta stock, crea venta completa, actualiza estado a 'liquidado'.
- **Cancelación**: Admin puede cancelar anticipo vencido con opción de devolver/no devolver monto.
- **Sección "Anticipos Pendientes"** en página Ventas (admin y vendedor). Muestra cliente, productos, total, anticipo, saldo, fecha límite, estado, acciones.
- **Alertas en Dashboard**: Anticipos vencidos se muestran como tarjetas rojas (admin y vendedor).
- **Endpoints**: GET/POST `/api/anticipos`, GET `/api/anticipos/pendientes`, GET `/api/anticipos/:id/ticket`, POST `/api/anticipos/:id/liquidar`, PUT `/api/anticipos/:id/cancelar`, GET `/api/anticipos/alertas`.

### 3. Abonos a Créditos
- **Nueva tabla `abonos_credito`**: SQLite y PostgreSQL. Campos: id, venta_id, monto, metodo_pago, fecha, numero_pago, created_at.
- **Sección "Créditos Pendientes"** en página Ventas. Muestra: cliente, folio, total, pagado, saldo, próximo pago.
- **Modal "Registrar Abono"**: Captura monto, fecha, método de pago. Valida que no supere saldo pendiente.
- **Actualización**: Al registrar abono se actualiza saldo_pendiente de la venta. Si el abono cubre el total, cambia estado a "Pagado" y libera crédito del cliente.
- **Ticket PDF de abono**: Cliente, folio venta, número de pago, monto abonado, saldo restante.
- **Historial de abonos**: Se muestra en el detalle de cada venta a crédito, cargado asíncronamente.
- **Endpoints**: GET `/api/creditos/pendientes`, POST `/api/creditos/:id/abono`, GET `/api/creditos/:id/abonos`, GET `/api/creditos/:id/ticket-abono`.

### Otros Arreglos
- Bug de formato de fecha PostgreSQL corregido: `created_at.split(' ')[0]` reemplazado por `created_at.slice(0,10)` en tabla Ventas y Facturación.
- CSP header ajustado.
- **Bug CSP critico**: `helmet.contentSecurityPolicy` agrega `script-src-attr 'none'` por defecto, bloqueando TODOS los onclick inline. Fijado con `scriptSrcAttr: ["'unsafe-inline'"]` y `useDefaults: false`.
- **Bug auth middleware**: Las rutas de login y registro estaban en `/api/login` y `/api/register-public`, pero el middleware verificaba `/login` y `/register-public`, bloqueando el acceso. Fijado en `server.js:42`.

## Próximos Pasos
- Hacer `git push` para desplegar todos los cambios a Railway
- Verificar en Railway que las tablas `anticipos` y `abonos_credito` se hayan creado
- Ejecutar `scripts/migracion_anticipos_abonos.sql` en Railway si las tablas no existen
- Migrar a app móvil (ruta: PWA → Capacitor → React Native según necesidad)

## Estructura del Proyecto
```
sistema viv/
├── server.js            # Backend Express (todos los endpoints)
├── database.js          # SQLite + PostgreSQL, fixSQL, esquemas, seed
├── package.json         # Dependencias (incluye xlsx, pdfkit, pg, bcryptjs)
├── .env                 # DATABASE_URL real de Railway (NO SUBIR A GIT)
├── .gitignore
├── SESION.md            # Memoria de sesión
├── public/
│   └── index.html       # Frontend SPA (vanilla JS, Chart.js, jspdf)
└── scripts/
    ├── migracion_costos.sql
    ├── migracion_creditos.sql
    └── migracion_anticipos_abonos.sql  # SQL para Railway Postgres
```

## Comandos Útiles
```powershell
npm install          # Instalar dependencias
npm start            # Iniciar servidor
git push             # Desplegar a Railway
node -c server.js    # Verificar sintaxis
```
