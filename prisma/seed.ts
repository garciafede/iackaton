import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  {
    ean: "7790895001234",
    brand: "Coca-Cola",
    name: "Coca-Cola Sin Azúcar",
    variant: "Zero",
    size: "1.5 L",
    category: "Bebidas",
    aliases: ["coca zero", "coca sin azucar", "cocacola zero", "coca 1.5", "coca zero grande"],
  },
  {
    ean: "7791813425678",
    brand: "Pepsi",
    name: "Pepsi Black",
    variant: "Black",
    size: "1.5 L",
    category: "Bebidas",
    aliases: ["pepsi black", "pepsi zero", "pepsi sin azucar", "pepsi 1.5", "pepsi negra"],
  },
  {
    ean: "7790070412345",
    brand: "Oreo",
    name: "Galletitas Oreo",
    variant: "Original",
    size: "118 g",
    category: "Galletitas",
    aliases: ["oreo", "galletitas oreo", "oreo original", "oreo 118", "oreo chicas"],
  },
  {
    ean: "7793704009876",
    brand: "Playadito",
    name: "Yerba Mate Playadito",
    variant: null,
    size: "1 kg",
    category: "Infusiones",
    aliases: ["playadito", "yerba playadito", "playadito 1kg", "yerba 1 kilo", "yerba amarilla"],
  },
  {
    ean: "7790290101111",
    brand: "Branca",
    name: "Fernet Branca",
    variant: null,
    size: "750 ml",
    category: "Bebidas alcohólicas",
    aliases: ["fernet", "fernet branca", "branca 750", "fernet 750", "ferne branca"],
  },
] as const;

const stores = [
  {
    chain: "Vea Demo",
    name: "Vea Demo Centro",
    address: "Ubicación ficticia DEMO A",
    latitude: "-26.820500",
    longitude: "-65.219500",
  },
  {
    chain: "Carrefour Demo",
    name: "Carrefour Demo Norte",
    address: "Ubicación ficticia DEMO B",
    latitude: "-26.835000",
    longitude: "-65.205000",
  },
  {
    chain: "Jumbo Demo",
    name: "Jumbo Demo Sur",
    address: "Ubicación ficticia DEMO C",
    latitude: "-26.790000",
    longitude: "-65.250000",
  },
];

async function main() {
  const createdProducts = await Promise.all(
    products.map(({ aliases: _aliases, ...product }) =>
      prisma.product.upsert({
        where: { ean: product.ean },
        update: product,
        create: product,
      }),
    ),
  );

  await prisma.productAlias.deleteMany({
    where: { productId: { in: createdProducts.map(({ id }) => id) } },
  });

  await prisma.productAlias.createMany({
    data: createdProducts.flatMap((product, index) =>
      products[index]!.aliases.map((alias) => ({ productId: product.id, alias })),
    ),
  });

  await prisma.offer.deleteMany({ where: { source: "DEMO" } });
  await prisma.store.deleteMany({ where: { chain: { endsWith: "Demo" } } });

  const createdStores = await Promise.all(
    stores.map((store) => prisma.store.create({ data: store })),
  );

  const checkedAt = new Date();

  await prisma.offer.createMany({
    data: createdProducts.flatMap((product, productIndex) =>
      createdStores.map((store, storeIndex) => ({
        productId: product.id,
        storeId: store.id,
        price: 1200 + productIndex * 850 + storeIndex * 125,
        stock: (productIndex + storeIndex) % 4 !== 3,
        source: "DEMO",
        lastCheckedAt: checkedAt,
      })),
    ),
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
