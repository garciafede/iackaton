import type { RealData } from "./seed-real.js";

// EDITAR ESTE ARCHIVO con datos relevados y verificados. No contiene datos reales.
// Las keys vinculan las ofertas con los productos/sucursales de este archivo.
// Si el registro ya existe, se puede añadir id: <ID existente> para corregir sus datos.
// Ver REAL-DATA.md antes de la primera carga. null en precio/coordenadas
// significa PENDIENTE: el importador se detiene sin escribir en PostgreSQL.
export const realData: RealData = {
  products: [
    {
      key: "producto-1",
      brand: "COMPLETAR_MARCA_1",
      name: "COMPLETAR_NOMBRE_1",
      variant: null,
      size: "COMPLETAR_TAMAÑO_1",
      ean: null,
    },
    {
      key: "producto-2",
      brand: "COMPLETAR_MARCA_2",
      name: "COMPLETAR_NOMBRE_2",
      variant: null,
      size: "COMPLETAR_TAMAÑO_2",
      ean: null,
    },
    {
      key: "producto-3",
      brand: "COMPLETAR_MARCA_3",
      name: "COMPLETAR_NOMBRE_3",
      variant: null,
      size: "COMPLETAR_TAMAÑO_3",
      ean: null,
    },
    {
      key: "producto-4",
      brand: "COMPLETAR_MARCA_4",
      name: "COMPLETAR_NOMBRE_4",
      variant: null,
      size: "COMPLETAR_TAMAÑO_4",
      ean: null,
    },
    {
      key: "producto-5",
      brand: "COMPLETAR_MARCA_5",
      name: "COMPLETAR_NOMBRE_5",
      variant: null,
      size: "COMPLETAR_TAMAÑO_5",
      ean: null,
    },
  ],
  stores: [
    {
      key: "sucursal-1",
      chain: "COMPLETAR_CADENA",
      name: "COMPLETAR_NOMBRE_SUCURSAL",
      address: "COMPLETAR_DIRECCIÓN",
      latitude: null, // Reemplazar por un string decimal relevado, hasta 6 decimales.
      longitude: null,
    },
    // Copiar este bloque para cada sucursal adicional, con una key diferente.
  ],
  offers: [
    {
      productKey: "producto-1",
      storeKey: "sucursal-1",
      price: null,
      stock: null,
      source: "COMPLETAR_FUENTE",
      lastCheckedAt: "COMPLETAR_FECHA_ISO",
    },
    {
      productKey: "producto-2",
      storeKey: "sucursal-1",
      price: null,
      stock: null,
      source: "COMPLETAR_FUENTE",
      lastCheckedAt: "COMPLETAR_FECHA_ISO",
    },
    {
      productKey: "producto-3",
      storeKey: "sucursal-1",
      price: null,
      stock: null,
      source: "COMPLETAR_FUENTE",
      lastCheckedAt: "COMPLETAR_FECHA_ISO",
    },
    {
      productKey: "producto-4",
      storeKey: "sucursal-1",
      price: null,
      stock: null,
      source: "COMPLETAR_FUENTE",
      lastCheckedAt: "COMPLETAR_FECHA_ISO",
    },
    {
      productKey: "producto-5",
      storeKey: "sucursal-1",
      price: null,
      stock: null,
      source: "COMPLETAR_FUENTE",
      lastCheckedAt: "COMPLETAR_FECHA_ISO",
    },
  ],
};
