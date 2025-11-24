import  prisma  from "@/lib/prismadb";

async function deleteCategoryProducts() {
  const categoryId = "1364f5f9-6f45-48fd-8cd1-09815e1606c0";
  const storeId = "a940170f-71ea-4c2b-b0ec-e2e9e3c68567"; // optional guard if you want to ensure store ownership
  const start = new Date("2024-11-20T00:00:00.000Z");
  const end = new Date("2024-11-24T00:00:00.000Z");

  try {
    const result = await prisma.products.deleteMany({
      where: {
        categoryId,         // remove this line if you don’t want a store constraint
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });

    console.log(`Deleted ${result.count} products`);
  } catch (err) {
    console.error("Failed to delete products", err);
  } finally {
    await prisma.$disconnect();
  }
}

deleteCategoryProducts();