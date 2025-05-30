// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeProduct(product: any) {
  return {
    ...product,
    price: product.price.toNumber(),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
