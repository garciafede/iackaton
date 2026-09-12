# Carga de datos reales

Editar **`prisma/real-data.ts`**. Allí están los cinco espacios para productos,
las sucursales y las ofertas. Todo lo marcado `COMPLETAR_...`, y los `null` de
coordenadas y precio, está pendiente: la carga se detiene sin escribir.
`stock: null` significa disponibilidad no confirmada y se conserva como tal.
Se puede empezar con menos productos quitando sus bloques y ofertas pendientes.

1. `products`: completar marca, nombre, variante y tamaño. `ean` es opcional
   (`null` si no se conoce; no usar los EAN ficticios del seed DEMO). `variant`
   y `size` también admiten `null` cuando corresponda.
2. `stores`: agregar una entrada por sucursal, con cadena, nombre, dirección y
   coordenadas verificadas. Coordenadas como strings con punto decimal y hasta
   seis decimales. No usar ubicaciones aproximadas como si fueran relevadas.
3. `offers`: vincular `productKey` y `storeKey` con las keys de los bloques
   anteriores. Precio en pesos como string decimal, sin símbolo ni separadores
   de miles y con hasta dos decimales. `stock` admite `true`, `false` o `null`;
   `false` conserva la oferta pero `/search` no la devuelve.
4. `source`: URL o descripción concreta del relevamiento. Se guarda con prefijo
   `REAL: `. `source: "DEMO"` sigue reservado a las ofertas ficticias.
5. `lastCheckedAt`: fecha real del relevamiento en formato
   `AAAA-MM-DDTHH:mm:ss-03:00` (o `Z` para UTC). No se reemplaza automáticamente
   por la hora de importación.

Validar sin conexión a PostgreSQL:

```powershell
npm run db:seed-real -- --check
```

Cargar o actualizar en la base configurada por `DATABASE_URL` en `.env`:

```powershell
npm run db:seed-real
```

## Repetir la carga sin duplicados

Los productos se buscan por EAN o por marca + nombre + variante + tamaño. Esto
permite reutilizar un producto del catálogo DEMO, conservando sus aliases y
ofertas existentes. No se crean EAN ficticios. Una coincidencia ambigua detiene
la carga; un EAN distinto requiere revisión explícita.

Las sucursales se buscan por cadena + nombre + dirección. Las coordenadas se
pueden actualizar sin crear una sucursal nueva. No se reutilizan sucursales con
ofertas DEMO. Las ofertas usan la clave única existente producto + sucursal:
repetir actualiza precio, stock, fuente y fecha únicamente si la observación es
más reciente, sin duplicarlas ni reemplazar precios más nuevos.

Conservar esos campos de identidad entre cargas. Para corregir el nombre,
tamaño o dirección de un registro existente, agregar `id: <ID existente>` al
bloque correspondiente. La carga imprime los IDs de productos y sucursales.
Las keys son referencias internas de este archivo, no identificadores en la base.

La carga usa upsert y una única transacción: cualquier error revierte todos los
cambios. Un bloqueo transaccional de PostgreSQL evita duplicados entre dos
ejecuciones simultáneas de este importador. No hace deletes ni migraciones.
Quitar un bloque del archivo no borra la fila existente.

## Estado del resto de la PoC

El schema soporta todos los campos; se permitió `stock: null`, sin agregar `isDemo`. `source` permite
distinguir las ofertas `DEMO`, `REAL: ...` y aquellas de origen todavía desconocido.
Un producto del catálogo puede tener ofertas de ambos tipos.

`/search` prioriza ofertas reales de hasta 7 días; DEMO solo es fallback en desarrollo.
OpenAI distingue por `source`, informa la fecha de verificación y conserva
"disponibilidad no confirmada" para `stock: null`. WhatsApp no ejecuta scrapers.

Para datos reales usar únicamente `db:seed-real`. El comando anterior `db:seed`
recrea los datos DEMO y puede sobrescribir productos compartidos; no ejecutarlo
como mecanismo de actualización de datos reales.
