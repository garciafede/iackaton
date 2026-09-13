/** Catálogo editorial: identidades observadas en SEPA. Evidencia: evidence/catalog/discovery.json.
 * Editar este archivo para ampliar/deshabilitar grupos; catalog:generate deriva la documentación.
 * quantity/unit permiten validar presentación. Cada EAN pertenece a un solo grupo.
 */
export type CatalogProduct = {
  key: string; name: string; brand: string; variant: string; size: string;
  quantity: number; unit: "g" | "ml" | "unit"; category: string; enabled: boolean;
  eans: string[]; aliases: string[]; eanVariants?: Record<string, string>;
};

export const catalogProducts: CatalogProduct[] = [
  {
    "key": "coca-zero-1500",
    "brand": "Coca-Cola",
    "name": "Coca-Cola Sin Azúcar",
    "variant": "Sin Azúcar",
    "size": "1.5 L",
    "quantity": 1500,
    "unit": "ml",
    "eans": [
      "7790895067556"
    ],
    "aliases": [
      "coca zero",
      "coca sin azucar",
      "coca cola zero"
    ],
    "category": "Gaseosas",
    "enabled": true
  },
  {
    "key": "oreo-118",
    "brand": "Oreo",
    "name": "Galletitas Oreo Original",
    "variant": "Original",
    "size": "118 g",
    "quantity": 118,
    "unit": "g",
    "eans": [
      "7622201735296",
      "7622201735272"
    ],
    "aliases": [
      "oreo",
      "oreo original",
      "galletitas oreo"
    ],
    "category": "Galletitas",
    "enabled": true
  },
  {
    "key": "playadito-1000",
    "brand": "Playadito",
    "name": "Yerba Mate Playadito Suave",
    "variant": "Suave con palo",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "eans": [
      "7793704000928"
    ],
    "aliases": [
      "playadito",
      "yerba playadito",
      "playadito 1 kg"
    ],
    "category": "Yerba",
    "enabled": true
  },
  {
    "key": "pepsi-black-1500",
    "brand": "Pepsi",
    "name": "Pepsi Black",
    "variant": "Black / Sin Azúcar",
    "size": "1.5 L",
    "quantity": 1500,
    "unit": "ml",
    "eans": [
      "7791813828419",
      "7791813421054"
    ],
    "aliases": [
      "pepsi black",
      "pepsi sin azucar",
      "pepsi zero"
    ],
    "category": "Gaseosas",
    "enabled": true
  },
  {
    "key": "gallo-oro-1000",
    "brand": "Gallo",
    "name": "Arroz Gallo Oro",
    "variant": "Parboil",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "eans": [
      "7790070431417",
      "7790070433091"
    ],
    "aliases": [
      "gallo oro",
      "arroz gallo oro",
      "gallo parboil"
    ],
    "category": "Arroz",
    "enabled": true,
    "eanVariants": {
      "7790070431417": "Parboil, bolsa",
      "7790070433091": "Parboil, caja"
    }
  },
  {
    "key": "fanta-naranja-2250",
    "name": "Gaseosa Fanta Naranja",
    "brand": "Fanta",
    "variant": "Naranja regular",
    "size": "2.25 L",
    "quantity": 2250,
    "unit": "ml",
    "category": "Gaseosas",
    "enabled": true,
    "eans": [
      "7790895001017"
    ],
    "aliases": [
      "fanta naranja",
      "fanta 2.25",
      "fanta naranja 2.25 litros"
    ]
  },
  {
    "key": "pepsi-original-2000",
    "name": "Pepsi Original",
    "brand": "Pepsi",
    "variant": "Regular",
    "size": "2 L",
    "quantity": 2000,
    "unit": "ml",
    "category": "Gaseosas",
    "enabled": true,
    "eans": [
      "7791813888468"
    ],
    "aliases": [
      "pepsi original",
      "pepsi comun 2 litros",
      "pepsi regular"
    ]
  },
  {
    "key": "sprite-2250",
    "name": "Sprite Lima Limón",
    "brand": "Sprite",
    "variant": "Regular",
    "size": "2.25 L",
    "quantity": 2250,
    "unit": "ml",
    "category": "Gaseosas",
    "enabled": true,
    "eans": [
      "7790895001000"
    ],
    "aliases": [
      "sprite",
      "sprite lima limon",
      "sprite 2.25 litros"
    ]
  },
  {
    "key": "coca-original-354",
    "name": "Coca-Cola Original",
    "brand": "Coca-Cola",
    "variant": "Regular, lata",
    "size": "354 ml",
    "quantity": 354,
    "unit": "ml",
    "category": "Gaseosas",
    "enabled": true,
    "eans": [
      "7790895000232"
    ],
    "aliases": [
      "coca original lata",
      "coca comun lata",
      "coca cola 354 ml"
    ]
  },
  {
    "key": "eco-andes-2000",
    "name": "Agua Eco de los Andes Sin Gas",
    "brand": "Eco de los Andes",
    "variant": "Sin gas",
    "size": "2 L",
    "quantity": 2000,
    "unit": "ml",
    "category": "Aguas",
    "enabled": true,
    "eans": [
      "7792799000097"
    ],
    "aliases": [
      "eco de los andes",
      "agua eco sin gas",
      "eco de los andes 2 litros"
    ]
  },
  {
    "key": "villa-sur-2250",
    "name": "Agua Villa del Sur Sin Gas",
    "brand": "Villa del Sur",
    "variant": "Sin gas",
    "size": "2.25 L",
    "quantity": 2250,
    "unit": "ml",
    "category": "Aguas",
    "enabled": true,
    "eans": [
      "7798062547559"
    ],
    "aliases": [
      "villa del sur",
      "agua villa del sur sin gas",
      "villa del sur 2.25 litros"
    ]
  },
  {
    "key": "villavicencio-1500",
    "name": "Agua Villavicencio Sin Gas",
    "brand": "Villavicencio",
    "variant": "Sin gas",
    "size": "1.5 L",
    "quantity": 1500,
    "unit": "ml",
    "category": "Aguas",
    "enabled": true,
    "eans": [
      "7799155000180"
    ],
    "aliases": [
      "villavicencio 1.5 litros",
      "agua villavicencio 1.5",
      "villavicencio litro y medio"
    ]
  },
  {
    "key": "villavicencio-2000",
    "name": "Agua Villavicencio Sin Gas",
    "brand": "Villavicencio",
    "variant": "Sin gas",
    "size": "2 L",
    "quantity": 2000,
    "unit": "ml",
    "category": "Aguas",
    "enabled": true,
    "eans": [
      "7799155000197"
    ],
    "aliases": [
      "villavicencio 2 litros",
      "agua villavicencio 2 l"
    ]
  },
  {
    "key": "tang-naranja-15",
    "name": "Jugo en Polvo Tang Naranja",
    "brand": "Tang",
    "variant": "Naranja",
    "size": "15 g",
    "quantity": 15,
    "unit": "g",
    "category": "Jugos",
    "enabled": true,
    "eans": [
      "7622201705961"
    ],
    "aliases": [
      "tang naranja",
      "jugo tang naranja",
      "tang naranja 15 g"
    ]
  },
  {
    "key": "tang-manzana-15",
    "name": "Jugo en Polvo Tang Manzana",
    "brand": "Tang",
    "variant": "Manzana",
    "size": "15 g",
    "quantity": 15,
    "unit": "g",
    "category": "Jugos",
    "enabled": true,
    "eans": [
      "7622201705992"
    ],
    "aliases": [
      "tang manzana",
      "jugo tang manzana"
    ]
  },
  {
    "key": "clight-pomelo-8",
    "name": "Jugo en Polvo Clight Pomelo Rosado",
    "brand": "Clight",
    "variant": "Pomelo rosado",
    "size": "8 g",
    "quantity": 8,
    "unit": "g",
    "category": "Jugos",
    "enabled": true,
    "eans": [
      "7622201703172"
    ],
    "aliases": [
      "clight pomelo",
      "clight pomelo rosado",
      "jugo clight pomelo"
    ]
  },
  {
    "key": "taragui-palo-1000",
    "name": "Yerba Mate Taragüi Con Palo",
    "brand": "Taragüi",
    "variant": "Con palo",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "category": "Yerba",
    "enabled": true,
    "eans": [
      "7790387013610"
    ],
    "aliases": [
      "yerba taragui",
      "taragui con palo",
      "taragui 1 kg"
    ]
  },
  {
    "key": "cruz-malta-1000",
    "name": "Yerba Mate Cruz de Malta Con Palo",
    "brand": "Cruz de Malta",
    "variant": "Con palo",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "category": "Yerba",
    "enabled": true,
    "eans": [
      "7790070509055"
    ],
    "aliases": [
      "cruz de malta",
      "yerba cruz de malta",
      "cruz de malta 1 kg"
    ]
  },
  {
    "key": "union-suave-500",
    "name": "Yerba Mate Unión Suave",
    "brand": "Unión",
    "variant": "Suave",
    "size": "500 g",
    "quantity": 500,
    "unit": "g",
    "category": "Yerba",
    "enabled": true,
    "eans": [
      "7790387014624"
    ],
    "aliases": [
      "yerba union suave",
      "union suave 500 g",
      "union suave medio kilo"
    ]
  },
  {
    "key": "cabrales-super-250",
    "name": "Café Súper Cabrales Tostado Molido",
    "brand": "Cabrales",
    "variant": "Súper, tostado molido",
    "size": "250 g",
    "quantity": 250,
    "unit": "g",
    "category": "Café",
    "enabled": true,
    "eans": [
      "7790550022234"
    ],
    "aliases": [
      "cafe cabrales",
      "super cabrales",
      "cabrales molido 250 g"
    ]
  },
  {
    "key": "dolca-origenes-170",
    "name": "Café Instantáneo Dolca Orígenes",
    "brand": "Dolca",
    "variant": "Orígenes, frasco",
    "size": "170 g",
    "quantity": 170,
    "unit": "g",
    "category": "Café",
    "enabled": true,
    "eans": [
      "8445291082212"
    ],
    "aliases": [
      "dolca origenes",
      "cafe dolca",
      "dolca frasco 170 g"
    ]
  },
  {
    "key": "nescafe-descafeinado-100",
    "name": "Café Instantáneo Nescafé Descafeinado",
    "brand": "Nescafé",
    "variant": "Descafeinado",
    "size": "100 g",
    "quantity": 100,
    "unit": "g",
    "category": "Café",
    "enabled": true,
    "eans": [
      "7613035379213"
    ],
    "aliases": [
      "nescafe descafeinado",
      "cafe sin cafeina nescafe",
      "nescafe descafeinado 100 g"
    ]
  },
  {
    "key": "virginia-te-25",
    "name": "Té La Virginia",
    "brand": "La Virginia",
    "variant": "En saquitos",
    "size": "25 saquitos",
    "quantity": 25,
    "unit": "unit",
    "category": "Té",
    "enabled": true,
    "eans": [
      "7790150211908"
    ],
    "aliases": [
      "te la virginia",
      "la virginia 25 saquitos",
      "te virginia 25"
    ]
  },
  {
    "key": "taragui-te-25",
    "name": "Té Taragüi Diamantado",
    "brand": "Taragüi",
    "variant": "Diamantado, en saquitos",
    "size": "25 saquitos",
    "quantity": 25,
    "unit": "unit",
    "category": "Té",
    "enabled": true,
    "eans": [
      "7790387800135"
    ],
    "aliases": [
      "te taragui",
      "te taragui diamantado",
      "taragui 25 saquitos"
    ]
  },
  {
    "key": "chocolinas-170",
    "name": "Galletitas Chocolinas Chocolate",
    "brand": "Chocolinas",
    "variant": "Chocolate",
    "size": "170 g",
    "quantity": 170,
    "unit": "g",
    "category": "Galletitas",
    "enabled": true,
    "eans": [
      "7790040143227"
    ],
    "aliases": [
      "chocolinas",
      "chocolinas chocolate",
      "chocolinas 170 g"
    ]
  },
  {
    "key": "sonrisas-108",
    "name": "Galletitas Sonrisas Frambuesa",
    "brand": "Sonrisas",
    "variant": "Rellenas de frambuesa",
    "size": "108 g",
    "quantity": 108,
    "unit": "g",
    "category": "Galletitas",
    "enabled": true,
    "eans": [
      "7790040133488"
    ],
    "aliases": [
      "sonrisas",
      "galletitas sonrisas",
      "sonrisas frambuesa"
    ]
  },
  {
    "key": "lincoln-219",
    "name": "Galletitas Lincoln Vainilla Clásicas",
    "brand": "Lincoln",
    "variant": "Vainilla clásicas",
    "size": "219 g",
    "quantity": 219,
    "unit": "g",
    "category": "Galletitas",
    "enabled": true,
    "eans": [
      "7622201735319"
    ],
    "aliases": [
      "lincoln",
      "galletitas lincoln",
      "lincoln vainilla"
    ]
  },
  {
    "key": "lays-clasicas-85",
    "name": "Papas Fritas Lay’s Clásicas",
    "brand": "Lay’s",
    "variant": "Clásicas",
    "size": "85 g",
    "quantity": 85,
    "unit": "g",
    "category": "Snacks",
    "enabled": true,
    "eans": [
      "7790310985458"
    ],
    "aliases": [
      "lays clasicas",
      "papas lays 85 g",
      "lays 85 gramos"
    ]
  },
  {
    "key": "doritos-queso-77",
    "name": "Nachos Doritos Queso",
    "brand": "Doritos",
    "variant": "Queso",
    "size": "77 g",
    "quantity": 77,
    "unit": "g",
    "category": "Snacks",
    "enabled": true,
    "eans": [
      "7790310985649"
    ],
    "aliases": [
      "doritos queso",
      "doritos 77 g",
      "nachos doritos"
    ]
  },
  {
    "key": "cheetos-queso-85",
    "name": "Palitos de Maíz Cheetos Queso",
    "brand": "Cheetos",
    "variant": "Queso",
    "size": "85 g",
    "quantity": 85,
    "unit": "g",
    "category": "Snacks",
    "enabled": true,
    "eans": [
      "7790310985809"
    ],
    "aliases": [
      "cheetos",
      "cheetos queso",
      "cheetos 85 g"
    ]
  },
  {
    "key": "gallo-fino-500",
    "name": "Arroz Gallo Largo Fino 00000",
    "brand": "Gallo",
    "variant": "Largo fino 00000",
    "size": "500 g",
    "quantity": 500,
    "unit": "g",
    "category": "Arroz",
    "enabled": true,
    "eans": [
      "7790070433145"
    ],
    "aliases": [
      "arroz gallo largo fino",
      "gallo fino 500 g",
      "arroz gallo cinco ceros"
    ]
  },
  {
    "key": "lucchetti-arroz-1000",
    "name": "Arroz Lucchetti Largo Fino 00000",
    "brand": "Lucchetti",
    "variant": "Largo fino 00000",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "category": "Arroz",
    "enabled": true,
    "eans": [
      "7790070431486"
    ],
    "aliases": [
      "arroz lucchetti",
      "lucchetti largo fino",
      "arroz lucchetti 1 kg"
    ]
  },
  {
    "key": "lucchetti-coditos-500",
    "name": "Fideos Lucchetti Coditos",
    "brand": "Lucchetti",
    "variant": "Coditos",
    "size": "500 g",
    "quantity": 500,
    "unit": "g",
    "category": "Fideos",
    "enabled": true,
    "eans": [
      "7790070318343"
    ],
    "aliases": [
      "coditos lucchetti",
      "fideos lucchetti coditos",
      "lucchetti coditos 500 g"
    ]
  },
  {
    "key": "matarazzo-tirabuzones-500",
    "name": "Fideos Matarazzo Tirabuzones",
    "brand": "Matarazzo",
    "variant": "Tirabuzones N28",
    "size": "500 g",
    "quantity": 500,
    "unit": "g",
    "category": "Fideos",
    "enabled": true,
    "eans": [
      "7790070336293"
    ],
    "aliases": [
      "tirabuzones matarazzo",
      "fideos matarazzo tirabuzones"
    ]
  },
  {
    "key": "matarazzo-tallarines-500",
    "name": "Fideos Matarazzo Tallarines",
    "brand": "Matarazzo",
    "variant": "Tallarines N5",
    "size": "500 g",
    "quantity": 500,
    "unit": "g",
    "category": "Fideos",
    "enabled": true,
    "eans": [
      "7790070336316"
    ],
    "aliases": [
      "tallarines matarazzo",
      "fideos matarazzo tallarines"
    ]
  },
  {
    "key": "morixe-000-1000",
    "name": "Harina Morixe 000",
    "brand": "Morixe",
    "variant": "000",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "category": "Harina",
    "enabled": true,
    "eans": [
      "7790199000013"
    ],
    "aliases": [
      "harina morixe 000",
      "morixe tres ceros",
      "harina morixe tres ceros"
    ]
  },
  {
    "key": "morixe-0000-1000",
    "name": "Harina Morixe 0000",
    "brand": "Morixe",
    "variant": "0000",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "category": "Harina",
    "enabled": true,
    "eans": [
      "7790199000020"
    ],
    "aliases": [
      "harina morixe 0000",
      "morixe cuatro ceros",
      "harina morixe cuatro ceros"
    ]
  },
  {
    "key": "pureza-leudante-1000",
    "name": "Harina Pureza Leudante",
    "brand": "Pureza",
    "variant": "Leudante",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "category": "Harina",
    "enabled": true,
    "eans": [
      "7792180140708"
    ],
    "aliases": [
      "harina pureza leudante",
      "pureza leudante",
      "harina leudante pureza 1 kg"
    ]
  },
  {
    "key": "ledesma-superior-1000",
    "name": "Azúcar Ledesma Molida Superior",
    "brand": "Ledesma",
    "variant": "Molida superior",
    "size": "1 kg",
    "quantity": 1000,
    "unit": "g",
    "category": "Azúcar",
    "enabled": true,
    "eans": [
      "7792540250450"
    ],
    "aliases": [
      "azucar ledesma superior",
      "azucar ledesma 1 kg",
      "ledesma molida superior"
    ]
  },
  {
    "key": "ledesma-mascabo-800",
    "name": "Azúcar Ledesma Selección Rubio Mascabo",
    "brand": "Ledesma",
    "variant": "Selección rubio mascabo",
    "size": "800 g",
    "quantity": 800,
    "unit": "g",
    "category": "Azúcar",
    "enabled": true,
    "eans": [
      "7792540294607"
    ],
    "aliases": [
      "azucar ledesma mascabo",
      "ledesma mascabo",
      "azucar mascabo ledesma 800 g"
    ]
  },
  {
    "key": "cocinero-girasol-900",
    "name": "Aceite Cocinero Girasol",
    "brand": "Cocinero",
    "variant": "Girasol",
    "size": "900 ml",
    "quantity": 900,
    "unit": "ml",
    "category": "Aceite",
    "enabled": true,
    "eans": [
      "7790070012050"
    ],
    "aliases": [
      "aceite cocinero 900",
      "cocinero girasol 900 ml",
      "aceite cocinero 900 ml"
    ]
  },
  {
    "key": "cocinero-girasol-1500",
    "name": "Aceite Cocinero Girasol",
    "brand": "Cocinero",
    "variant": "Girasol",
    "size": "1.5 L",
    "quantity": 1500,
    "unit": "ml",
    "category": "Aceite",
    "enabled": true,
    "eans": [
      "7790060023684"
    ],
    "aliases": [
      "aceite cocinero 1.5",
      "cocinero girasol litro y medio",
      "aceite cocinero 1.5 litros"
    ]
  },
  {
    "key": "cocinero-oliva-500",
    "name": "Aceite Cocinero Oliva Extra Virgen",
    "brand": "Cocinero",
    "variant": "Oliva extra virgen",
    "size": "500 ml",
    "quantity": 500,
    "unit": "ml",
    "category": "Aceite",
    "enabled": true,
    "eans": [
      "7790070265098"
    ],
    "aliases": [
      "aceite oliva cocinero",
      "cocinero oliva extra virgen",
      "aceite oliva cocinero 500 ml"
    ]
  },
  {
    "key": "arcor-arvejas-300",
    "name": "Arvejas Arcor Secas Remojadas",
    "brand": "Arcor",
    "variant": "Secas remojadas, lata",
    "size": "300 g",
    "quantity": 300,
    "unit": "g",
    "category": "Conservas",
    "enabled": true,
    "eans": [
      "7790580132392"
    ],
    "aliases": [
      "arvejas arcor",
      "arvejas arcor lata",
      "arvejas arcor 300 g"
    ]
  },
  {
    "key": "arcor-choclo-300",
    "name": "Choclo Arcor Granos Amarillos",
    "brand": "Arcor",
    "variant": "Granos amarillos, lata",
    "size": "300 g",
    "quantity": 300,
    "unit": "g",
    "category": "Conservas",
    "enabled": true,
    "eans": [
      "7790580132422"
    ],
    "aliases": [
      "choclo arcor",
      "choclo amarillo arcor",
      "choclo arcor 300 g"
    ]
  },
  {
    "key": "campagnola-atun-170",
    "name": "Atún La Campagnola Lomitos Al Natural",
    "brand": "La Campagnola",
    "variant": "Lomitos al natural",
    "size": "170 g",
    "quantity": 170,
    "unit": "g",
    "category": "Conservas",
    "enabled": true,
    "eans": [
      "7790580131364"
    ],
    "aliases": [
      "atun campagnola natural",
      "atun la campagnola al natural",
      "lomitos atun campagnola 170 g"
    ]
  },
  {
    "key": "campagnola-tomate-530",
    "name": "Puré de Tomate La Campagnola",
    "brand": "La Campagnola",
    "variant": "Puré, tetra",
    "size": "530 g",
    "quantity": 530,
    "unit": "g",
    "category": "Salsas",
    "enabled": true,
    "eans": [
      "7790580138868"
    ],
    "aliases": [
      "pure tomate campagnola",
      "pure de tomate la campagnola",
      "tomate campagnola 530 g"
    ]
  },
  {
    "key": "arcor-tomate-400",
    "name": "Tomate Arcor Pelado Perita",
    "brand": "Arcor",
    "variant": "Pelado perita, lata",
    "size": "400 g",
    "quantity": 400,
    "unit": "g",
    "category": "Salsas",
    "enabled": true,
    "eans": [
      "7790580567903"
    ],
    "aliases": [
      "tomate perita arcor",
      "tomate pelado arcor",
      "tomate arcor lata 400 g"
    ]
  },
  {
    "key": "hellmanns-mayonesa-475",
    "name": "Mayonesa Hellmann’s Regular",
    "brand": "Hellmann’s",
    "variant": "Regular, doy pack",
    "size": "475 g",
    "quantity": 475,
    "unit": "g",
    "category": "Salsas",
    "enabled": true,
    "eans": [
      "7794000006072"
    ],
    "aliases": [
      "mayonesa hellmanns",
      "hellmanns mayonesa 475 g",
      "mayonesa hellmanns regular"
    ]
  },
  {
    "key": "serenisima-entera-1000",
    "name": "Leche La Serenísima Entera UAT",
    "brand": "La Serenísima",
    "variant": "Entera, fortificada, 3%",
    "size": "1 L",
    "quantity": 1000,
    "unit": "ml",
    "category": "Lácteos",
    "enabled": true,
    "eans": [
      "7790742363008"
    ],
    "aliases": [
      "leche serenisima entera",
      "la serenisima entera larga vida",
      "leche entera serenisima 1 litro"
    ]
  },
  {
    "key": "serenisima-descremada-1000",
    "name": "Leche La Serenísima Parcialmente Descremada UAT",
    "brand": "La Serenísima",
    "variant": "Parcialmente descremada, fortificada, 1%",
    "size": "1 L",
    "quantity": 1000,
    "unit": "ml",
    "category": "Lácteos",
    "enabled": true,
    "eans": [
      "7790742363107"
    ],
    "aliases": [
      "leche serenisima descremada",
      "la serenisima descremada larga vida",
      "leche serenisima 1 por ciento"
    ]
  },
  {
    "key": "serenisima-colonial-400",
    "name": "Dulce de Leche La Serenísima Colonial",
    "brand": "La Serenísima",
    "variant": "Colonial",
    "size": "400 g",
    "quantity": 400,
    "unit": "g",
    "category": "Lácteos",
    "enabled": true,
    "eans": [
      "7790742625205"
    ],
    "aliases": [
      "dulce de leche serenisima colonial",
      "dulce serenisima colonial",
      "la serenisima colonial 400 g"
    ]
  },
  {
    "key": "casancrem-light-290",
    "name": "Queso Crema Casancrem Light",
    "brand": "Casancrem",
    "variant": "Light",
    "size": "290 g",
    "quantity": 290,
    "unit": "g",
    "category": "Lácteos",
    "enabled": true,
    "eans": [
      "7791337061385"
    ],
    "aliases": [
      "casancrem light",
      "queso casancrem light",
      "casancrem light 290 g"
    ]
  },
  {
    "key": "ayudin-original-1000",
    "name": "Lavandina Ayudín Original",
    "brand": "Ayudín",
    "variant": "Original",
    "size": "1 L",
    "quantity": 1000,
    "unit": "ml",
    "category": "Limpieza",
    "enabled": true,
    "eans": [
      "7790132098459"
    ],
    "aliases": [
      "lavandina ayudin",
      "ayudin original 1 litro",
      "lavandina ayudin original"
    ]
  },
  {
    "key": "ala-ecolavado-3000",
    "name": "Jabón Líquido Ala Matic Eco Lavado",
    "brand": "Ala",
    "variant": "Matic eco lavado, para ropa",
    "size": "3 L",
    "quantity": 3000,
    "unit": "ml",
    "category": "Limpieza",
    "enabled": true,
    "eans": [
      "7791290792036"
    ],
    "aliases": [
      "jabon ala matic",
      "ala eco lavado",
      "ala matic 3 litros"
    ]
  },
  {
    "key": "cif-limon-300",
    "name": "Detergente Cif Bioactive Limón",
    "brand": "Cif",
    "variant": "Bioactive limón",
    "size": "300 ml",
    "quantity": 300,
    "unit": "ml",
    "category": "Limpieza",
    "enabled": true,
    "eans": [
      "7791290794054"
    ],
    "aliases": [
      "detergente cif 300",
      "cif limon 300 ml",
      "detergente cif limon 300 ml"
    ]
  },
  {
    "key": "cif-limon-500",
    "name": "Detergente Cif Bioactive Limón",
    "brand": "Cif",
    "variant": "Bioactive limón",
    "size": "500 ml",
    "quantity": 500,
    "unit": "ml",
    "category": "Limpieza",
    "enabled": true,
    "eans": [
      "7791290794061"
    ],
    "aliases": [
      "detergente cif 500",
      "cif limon 500 ml",
      "detergente cif limon 500 ml"
    ]
  },
  {
    "key": "sedal-balance-340",
    "name": "Shampoo Sedal Crema Balance",
    "brand": "Sedal",
    "variant": "Crema balance",
    "size": "340 ml",
    "quantity": 340,
    "unit": "ml",
    "category": "Higiene personal",
    "enabled": true,
    "eans": [
      "7791293045740"
    ],
    "aliases": [
      "shampoo sedal balance",
      "sedal crema balance",
      "champu sedal balance 340 ml"
    ]
  },
  {
    "key": "sedal-ceramidas-650",
    "name": "Shampoo Sedal Ceramidas",
    "brand": "Sedal",
    "variant": "Ceramidas",
    "size": "650 ml",
    "quantity": 650,
    "unit": "ml",
    "category": "Higiene personal",
    "enabled": true,
    "eans": [
      "7791293045795"
    ],
    "aliases": [
      "shampoo sedal ceramidas",
      "sedal ceramidas 650 ml",
      "champu sedal ceramidas"
    ]
  },
  {
    "key": "dove-blanco-90",
    "name": "Jabón de Tocador Dove Blanco",
    "brand": "Dove",
    "variant": "Blanco",
    "size": "90 g",
    "quantity": 90,
    "unit": "g",
    "category": "Higiene personal",
    "enabled": true,
    "eans": [
      "7791293051208"
    ],
    "aliases": [
      "jabon dove blanco",
      "dove blanco 90 g",
      "jabon dove"
    ]
  }
];
