import prismadb from "@/lib/prismadb";
import { ProductForm } from "./_components/Product-form";

interface PageProps {
    params: Promise<{ productId: string; storeId: string }>;
}

const ProductPage = async ({ params }: PageProps) => {
    const { productId, storeId } = await params;

    const product = await prismadb.products.findUnique({
        where: {
            id: productId,
        },
        include: {
            Image: true,
        },
    });

    const categories = await prismadb.category.findMany({
        where: {
            storeId: storeId,
        },
    });


    return (
        <div className="flex-col">
            <div className="flex-1 space-y-4 p-8 pt-6">
                <ProductForm
                    categories={categories}
                    initialData={product ? JSON.parse(JSON.stringify(product)) : null}
                />
            </div>
        </div>
    );
};

export default ProductPage;