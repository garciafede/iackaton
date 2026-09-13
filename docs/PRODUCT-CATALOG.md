# Catálogo validado de la PoC

<!-- Generado por npm run catalog:generate. No mantener una lista manual aquí. -->

- Productos/grupos consultables: **60** de 60 habilitados.
- EAN únicos con ofertas reales utilizables: **62** (63 configurados).
- Categorías: **18** — Aceite, Aguas, Arroz, Azúcar, Café, Conservas, Fideos, Galletitas, Gaseosas, Harina, Higiene personal, Jugos, Lácteos, Limpieza, Salsas, Snacks, Té, Yerba.
- Ofertas reales utilizables: **3303**; sucursales: **59**.
- Última actualización SEPA presente en esas ofertas: **12/09/2026, 08:30 (UTC−03:00)**.

| Cadena | Grupos consultables | Ofertas reales | Sucursales |
|---|---:|---:|---:|
| Carrefour | 60 | 1660 | 28 |
| Vea | 53 | 1643 | 31 |

Cobertura importada: Tucumán, Córdoba, CABA y provincia de Buenos Aires, con el
límite de sucursales definido en **src/prices/config.ts**. ChangoMás sigue configurado,
pero no aporta ofertas SEPA utilizables mientras sus fechas declaradas sean antiguas.
No se agregaron otras cadenas. Los precios web sin sucursal física verificada no se importan.

Se cuentan ofertas REAL con precio positivo, sucursal y coordenadas válidas,
stock true/null y fecha dentro del límite de siete días. No se cuentan DEMO,
ofertas agotadas, vencidas ni EAN que solo aparecen en configuración. No todos los
productos tienen cobertura en cada sucursal ni dentro del radio de cada usuario.
El radio de búsqueda predeterminado sigue siendo 25 km.

| Producto | Marca | Presentación | Categoría | Aliases principales | Ofertas reales | Cadenas |
|---|---|---|---|---|---:|---|
| Coca-Cola Sin Azúcar | Coca-Cola | 1,5 L | Gaseosas | coca zero; coca sin azucar; coca cola zero | 36 | Carrefour, Vea |
| Galletitas Oreo Original | Oreo | 118 g | Galletitas | oreo; oreo original; galletitas oreo | 59 | Carrefour, Vea |
| Yerba Mate Playadito Suave | Playadito | 1 kg | Yerba | playadito; yerba playadito; playadito 1 kg | 54 | Carrefour, Vea |
| Pepsi Black | Pepsi | 1,5 L | Gaseosas | pepsi black; pepsi sin azucar; pepsi zero | 84 | Carrefour, Vea |
| Arroz Gallo Oro | Gallo | 1 kg | Arroz | gallo oro; arroz gallo oro; gallo parboil | 113 | Carrefour, Vea |
| Gaseosa Fanta Naranja | Fanta | 2,25 L | Gaseosas | fanta naranja; fanta 2.25; fanta naranja 2.25 litros | 59 | Carrefour, Vea |
| Pepsi Original | Pepsi | 2 L | Gaseosas | pepsi original; pepsi comun 2 litros; pepsi regular | 59 | Carrefour, Vea |
| Sprite Lima Limón | Sprite | 2,25 L | Gaseosas | sprite; sprite lima limon; sprite 2.25 litros | 27 | Carrefour |
| Coca-Cola Original | Coca-Cola | 354 ml | Gaseosas | coca original lata; coca comun lata; coca cola 354 ml | 58 | Carrefour, Vea |
| Agua Eco de los Andes Sin Gas | Eco de los Andes | 2 L | Aguas | eco de los andes; agua eco sin gas; eco de los andes 2 litros | 59 | Carrefour, Vea |
| Agua Villa del Sur Sin Gas | Villa del Sur | 2,25 L | Aguas | villa del sur; agua villa del sur sin gas; villa del sur 2.25 litros | 28 | Carrefour |
| Agua Villavicencio Sin Gas | Villavicencio | 1,5 L | Aguas | villavicencio 1.5 litros; agua villavicencio 1.5; villavicencio litro y medio | 57 | Carrefour, Vea |
| Agua Villavicencio Sin Gas | Villavicencio | 2 L | Aguas | villavicencio 2 litros; agua villavicencio 2 l | 56 | Carrefour, Vea |
| Jugo en Polvo Tang Naranja | Tang | 15 g | Jugos | tang naranja; jugo tang naranja; tang naranja 15 g | 58 | Carrefour, Vea |
| Jugo en Polvo Tang Manzana | Tang | 15 g | Jugos | tang manzana; jugo tang manzana | 59 | Carrefour, Vea |
| Jugo en Polvo Clight Pomelo Rosado | Clight | 8 g | Jugos | clight pomelo; clight pomelo rosado; jugo clight pomelo | 59 | Carrefour, Vea |
| Yerba Mate Taragüi Con Palo | Taragüi | 1 kg | Yerba | yerba taragui; taragui con palo; taragui 1 kg | 59 | Carrefour, Vea |
| Yerba Mate Cruz de Malta Con Palo | Cruz de Malta | 1 kg | Yerba | cruz de malta; yerba cruz de malta; cruz de malta 1 kg | 58 | Carrefour, Vea |
| Yerba Mate Unión Suave | Unión | 500 g | Yerba | yerba union suave; union suave 500 g; union suave medio kilo | 58 | Carrefour, Vea |
| Café Súper Cabrales Tostado Molido | Cabrales | 250 g | Café | cafe cabrales; super cabrales; cabrales molido 250 g | 59 | Carrefour, Vea |
| Café Instantáneo Dolca Orígenes | Dolca | 170 g | Café | dolca origenes; cafe dolca; dolca frasco 170 g | 59 | Carrefour, Vea |
| Café Instantáneo Nescafé Descafeinado | Nescafé | 100 g | Café | nescafe descafeinado; cafe sin cafeina nescafe; nescafe descafeinado 100 g | 56 | Carrefour, Vea |
| Té La Virginia | La Virginia | 25 saquitos | Té | te la virginia; la virginia 25 saquitos; te virginia 25 | 52 | Carrefour, Vea |
| Té Taragüi Diamantado | Taragüi | 25 saquitos | Té | te taragui; te taragui diamantado; taragui 25 saquitos | 59 | Carrefour, Vea |
| Galletitas Chocolinas Chocolate | Chocolinas | 170 g | Galletitas | chocolinas; chocolinas chocolate; chocolinas 170 g | 59 | Carrefour, Vea |
| Galletitas Sonrisas Frambuesa | Sonrisas | 108 g | Galletitas | sonrisas; galletitas sonrisas; sonrisas frambuesa | 59 | Carrefour, Vea |
| Galletitas Lincoln Vainilla Clásicas | Lincoln | 219 g | Galletitas | lincoln; galletitas lincoln; lincoln vainilla | 28 | Carrefour |
| Papas Fritas Lay’s Clásicas | Lay’s | 85 g | Snacks | lays clasicas; papas lays 85 g; lays 85 gramos | 27 | Carrefour |
| Nachos Doritos Queso | Doritos | 77 g | Snacks | doritos queso; doritos 77 g; nachos doritos | 21 | Carrefour |
| Palitos de Maíz Cheetos Queso | Cheetos | 85 g | Snacks | cheetos; cheetos queso; cheetos 85 g | 23 | Carrefour |
| Arroz Gallo Largo Fino 00000 | Gallo | 500 g | Arroz | arroz gallo largo fino; gallo fino 500 g; arroz gallo cinco ceros | 59 | Carrefour, Vea |
| Arroz Lucchetti Largo Fino 00000 | Lucchetti | 1 kg | Arroz | arroz lucchetti; lucchetti largo fino; arroz lucchetti 1 kg | 58 | Carrefour, Vea |
| Fideos Lucchetti Coditos | Lucchetti | 500 g | Fideos | coditos lucchetti; fideos lucchetti coditos; lucchetti coditos 500 g | 59 | Carrefour, Vea |
| Fideos Matarazzo Tirabuzones | Matarazzo | 500 g | Fideos | tirabuzones matarazzo; fideos matarazzo tirabuzones | 59 | Carrefour, Vea |
| Fideos Matarazzo Tallarines | Matarazzo | 500 g | Fideos | tallarines matarazzo; fideos matarazzo tallarines | 59 | Carrefour, Vea |
| Harina Morixe 000 | Morixe | 1 kg | Harina | harina morixe 000; morixe tres ceros; harina morixe tres ceros | 59 | Carrefour, Vea |
| Harina Morixe 0000 | Morixe | 1 kg | Harina | harina morixe 0000; morixe cuatro ceros; harina morixe cuatro ceros | 59 | Carrefour, Vea |
| Harina Pureza Leudante | Pureza | 1 kg | Harina | harina pureza leudante; pureza leudante; harina leudante pureza 1 kg | 58 | Carrefour, Vea |
| Azúcar Ledesma Molida Superior | Ledesma | 1 kg | Azúcar | azucar ledesma superior; azucar ledesma 1 kg; ledesma molida superior | 51 | Carrefour, Vea |
| Azúcar Ledesma Selección Rubio Mascabo | Ledesma | 800 g | Azúcar | azucar ledesma mascabo; ledesma mascabo; azucar mascabo ledesma 800 g | 41 | Carrefour, Vea |
| Aceite Cocinero Girasol | Cocinero | 900 ml | Aceite | aceite cocinero 900; cocinero girasol 900 ml; aceite cocinero 900 ml | 59 | Carrefour, Vea |
| Aceite Cocinero Girasol | Cocinero | 1,5 L | Aceite | aceite cocinero 1.5; cocinero girasol litro y medio; aceite cocinero 1.5 litros | 58 | Carrefour, Vea |
| Aceite Cocinero Oliva Extra Virgen | Cocinero | 500 ml | Aceite | aceite oliva cocinero; cocinero oliva extra virgen; aceite oliva cocinero 500 ml | 56 | Carrefour, Vea |
| Arvejas Arcor Secas Remojadas | Arcor | 300 g | Conservas | arvejas arcor; arvejas arcor lata; arvejas arcor 300 g | 58 | Carrefour, Vea |
| Choclo Arcor Granos Amarillos | Arcor | 300 g | Conservas | choclo arcor; choclo amarillo arcor; choclo arcor 300 g | 56 | Carrefour, Vea |
| Atún La Campagnola Lomitos Al Natural | La Campagnola | 170 g | Conservas | atun campagnola natural; atun la campagnola al natural; lomitos atun campagnola 170 g | 57 | Carrefour, Vea |
| Puré de Tomate La Campagnola | La Campagnola | 530 g | Salsas | pure tomate campagnola; pure de tomate la campagnola; tomate campagnola 530 g | 59 | Carrefour, Vea |
| Tomate Arcor Pelado Perita | Arcor | 400 g | Salsas | tomate perita arcor; tomate pelado arcor; tomate arcor lata 400 g | 28 | Carrefour |
| Mayonesa Hellmann’s Regular | Hellmann’s | 475 g | Salsas | mayonesa hellmanns; hellmanns mayonesa 475 g; mayonesa hellmanns regular | 59 | Carrefour, Vea |
| Leche La Serenísima Entera UAT | La Serenísima | 1 L | Lácteos | leche serenisima entera; la serenisima entera larga vida; leche entera serenisima 1 litro | 59 | Carrefour, Vea |
| Leche La Serenísima Parcialmente Descremada UAT | La Serenísima | 1 L | Lácteos | leche serenisima descremada; la serenisima descremada larga vida; leche serenisima 1 por ciento | 59 | Carrefour, Vea |
| Dulce de Leche La Serenísima Colonial | La Serenísima | 400 g | Lácteos | dulce de leche serenisima colonial; dulce serenisima colonial; la serenisima colonial 400 g | 59 | Carrefour, Vea |
| Queso Crema Casancrem Light | Casancrem | 290 g | Lácteos | casancrem light; queso casancrem light; casancrem light 290 g | 59 | Carrefour, Vea |
| Lavandina Ayudín Original | Ayudín | 1 L | Limpieza | lavandina ayudin; ayudin original 1 litro; lavandina ayudin original | 59 | Carrefour, Vea |
| Jabón Líquido Ala Matic Eco Lavado | Ala | 3 L | Limpieza | jabon ala matic; ala eco lavado; ala matic 3 litros | 59 | Carrefour, Vea |
| Detergente Cif Bioactive Limón | Cif | 300 ml | Limpieza | detergente cif 300; cif limon 300 ml; detergente cif limon 300 ml | 59 | Carrefour, Vea |
| Detergente Cif Bioactive Limón | Cif | 500 ml | Limpieza | detergente cif 500; cif limon 500 ml; detergente cif limon 500 ml | 59 | Carrefour, Vea |
| Shampoo Sedal Crema Balance | Sedal | 340 ml | Higiene personal | shampoo sedal balance; sedal crema balance; champu sedal balance 340 ml | 59 | Carrefour, Vea |
| Shampoo Sedal Ceramidas | Sedal | 650 ml | Higiene personal | shampoo sedal ceramidas; sedal ceramidas 650 ml; champu sedal ceramidas | 59 | Carrefour, Vea |
| Jabón de Tocador Dove Blanco | Dove | 90 g | Higiene personal | jabon dove blanco; dove blanco 90 g; jabon dove | 59 | Carrefour, Vea |

Todos los grupos habilitados tienen al menos una oferta real utilizable.

Los tamaños distintos son grupos distintos. Los EAN de un mismo grupo conservan
su identidad; por ejemplo, Gallo Oro distingue bolsa y caja en cada oferta.
Una marca sola puede ser ambigua: especificar el producto, variante y presentación.
Ejemplos: «villavicencio 1.5 litros», «villavicencio 2 litros», «harina morixe 000».

## Actualizar y ampliar

1. Editar únicamente **src/catalog/products.ts**: identidad verificada, EAN, aliases,
   categoría y **enabled**. No reutilizar un EAN o alias exacto en grupos distintos.
2. Ejecutar **npm run prices:sepa -- --dry-run** y revisar cobertura y descartes.
3. Ejecutar **npm run prices:sepa** para importar con upsert; no borra datos existentes.
4. Ejecutar **npm run catalog:generate** para regenerar este documento y la tabla del README.

**catalog:generate** solo lee PostgreSQL; no actualiza precios. Si faltan ofertas
para un grupo habilitado, lo informa y termina con código 1. Deshabilitar un grupo
no borra sus filas de PostgreSQL ni las convierte en DEMO.

Playwright consulta los cinco grupos de **playwrightSmokeProductKeys** por defecto.
Permite **--product=clave**, **--category=Categoría** o **--all** como alternativas
explícitas; no se ejecutaron búsquedas web masivas para ampliar este catálogo.

Identidades y descartes: [evidencia SEPA](../evidence/catalog/discovery.json).
Estos grupos son el dataset validado para demo y regresiones, no un máximo de
productos soportables. La búsqueda dinámica de productos no precargados está
implementada bajo LIVE_RETAILER_SEARCH=true, con tres cadenas HTTP y fallback SEPA.
El valor predeterminado false conserva la búsqueda estable. Ver [LIVE-SEARCH](LIVE-SEARCH.md).
Fuentes y reglas: [PRICE-SOURCES](PRICE-SOURCES.md).
Los precios se consultan en la aplicación; no se publican en este documento.
