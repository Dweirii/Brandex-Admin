import { ProductImporter } from "@/components/product-importer"



 const ImportPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Import Products</h2>
        </div>
        <ProductImporter storeId={(await params).storeId} />
      </div>
    </div>
  )
}

export default ImportPage;
