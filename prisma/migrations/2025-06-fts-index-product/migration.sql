-- Full-Text Search index for Product (name, description, keywords)
CREATE INDEX IF NOT EXISTS product_fulltext_idx ON "products"
USING GIN (
  to_tsvector('english',
    coalesce("name", '') || ' ' ||
    coalesce("description", '') || ' ' ||
    array_to_string("keywords", ' ')
  )
);
