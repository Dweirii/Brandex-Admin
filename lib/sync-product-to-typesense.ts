import { typesenseAdmin, PRODUCT_COLLECTION_NAME, toTypesenseDocument } from './typesense';
import prismadb from './prismadb';

export async function syncProductToTypesense(productId: string) {
  try {
    const product = await prismadb.products.findUnique({
      where: { id: productId },
      include: { Category: true },
    });

    if (!product) {
      await typesenseAdmin
        .collections(PRODUCT_COLLECTION_NAME)
        .documents(productId)
        .delete()
        .catch(err => console.log('Product not in Typesense:', productId));
      return;
    }

    const document = toTypesenseDocument(product);
    await typesenseAdmin
      .collections(PRODUCT_COLLECTION_NAME)
      .documents()
      .upsert(document);

    console.log(`Synced product ${productId} to Typesense`);
  } catch (error) {
    console.error(`Failed to sync product ${productId}:`, error);
  }
}

export async function deleteProductFromTypesense(productId: string) {
  try {
    await typesenseAdmin
      .collections(PRODUCT_COLLECTION_NAME)
      .documents(productId)
      .delete();
    console.log(`Deleted product ${productId} from Typesense`);
  } catch (error) {
    console.error(`Failed to delete product ${productId}:`, error);
  }
}
