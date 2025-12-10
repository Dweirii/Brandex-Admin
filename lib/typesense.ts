import "dotenv/config";
import Typesense from 'typesense';

export const typesenseAdmin = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST || 'brandex-typesense.fly.dev',
    port: parseInt(process.env.TYPESENSE_PORT || '443'),
    protocol: (process.env.TYPESENSE_PROTOCOL || 'https') as 'http' | 'https'
  }],
  apiKey: process.env.TYPESENSE_ADMIN_API_KEY!,
  connectionTimeoutSeconds: 10,
  numRetries: 3,
  retryIntervalSeconds: 1,
});

export const typesenseSearch = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST || 'brandex-typesense.fly.dev',
    port: parseInt(process.env.TYPESENSE_PORT || '443'),
    protocol: (process.env.TYPESENSE_PROTOCOL || 'https') as 'http' | 'https'
  }],
  apiKey: process.env.TYPESENSE_SEARCH_API_KEY!,
  connectionTimeoutSeconds: 5,
  numRetries: 2,
});

// Collection name
export const PRODUCT_COLLECTION_NAME = 'products';

export const productSchema = {
  name: PRODUCT_COLLECTION_NAME,
  fields: [
    { name: 'id', type: 'string' },
    { name: 'storeId', type: 'string', facet: true },
    { name: 'name', type: 'string', sort: true },
    { name: 'description', type: 'string', optional: true },
    { name: 'keywords', type: 'string[]', optional: true, facet: true },
    { name: 'categoryId', type: 'string', facet: true },
    { name: 'categoryName', type: 'string', facet: true, optional: true },
    { name: 'price', type: 'float', optional: true },
    { name: 'downloadsCount', type: 'int32' },
    { name: 'isArchived', type: 'bool', facet: true },
    { name: 'isFeatured', type: 'bool', facet: true },
    { name: 'createdAt', type: 'int64' },
  ],
  default_sorting_field: 'downloadsCount'
} as const;

export type ProductDocument = {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  keywords?: string[];
  categoryId: string;
  categoryName?: string;
  price?: number;
  downloadsCount: number;
  isArchived: boolean;
  isFeatured: boolean;
  createdAt: number;
};

export function toTypesenseDocument(product: any): ProductDocument {
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    description: product.description || '',
    keywords: product.keywords || [],
    categoryId: product.categoryId,
    categoryName: product.Category?.name || '',
    price: product.price ? parseFloat(product.price.toString()) : 0,
    downloadsCount: product.downloadsCount || 0,
    isArchived: product.isArchived || false,
    isFeatured: product.isFeatured || false,
    createdAt: Math.floor(new Date(product.createdAt).getTime() / 1000),
  };
}

