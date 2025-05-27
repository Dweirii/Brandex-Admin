"use client";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, ListIcon, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProductColumn, columns } from "./columns";
import { DataTable } from "@/components/data-table";

interface ProductClientProps {
    data: ProductColumn[]
    storeId: string;
}

export const ProductClient: React.FC<ProductClientProps> = ({
    data,
    storeId
}) =>{

  const router = useRouter();
  const handleCreate = () => {
    router.push(`/${storeId}/products/new`);
  };

    return (
 <div className="flex flex-col min-h-screen bg-background">
        <header className="bg-card border-b px-6 py-4 md:px-8 md:py-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <ListIcon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <span>Products</span>
            </h1>
          </div>
        </header>
  
        <main className="flex-1 p-4 md:p-8">
          <div className="rounded-lg border bg-card shadow-sm transition-all">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 md:p-6">
              <div className="flex items-center gap-2 mb-4 md:mb-0">
                <ListIcon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-medium">Products List</h2>
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {data.length} {data.length === 1 ? "Product" : "Products"}
              </div>
            </div>
  
            <Separator />
  
            {data.length > 0 ? (
              <div className="p-4">
                <div className="flex items-center justify-between pb-5">
                  <Heading
                    title={`Products (${data.length})`}
                    description="Manage Products for your store"
                  />
                  <Button onClick={handleCreate}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add New
                  </Button>
                </div>
                <Separator />
                <DataTable searchKey="name" columns={columns} data={data} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="rounded-full bg-primary/10 p-3 mb-4">
                  <CalendarIcon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Products found</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  You haven&apos;t created any Products yet.<br/> Products are used to promote specific collections or
                  products on your storefront.
                </p>
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Products
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>  
    )
}