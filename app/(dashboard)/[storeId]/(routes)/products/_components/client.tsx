"use client";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, ListIcon, Plus, DollarSign, X, Trash2, Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { ProductColumn, columns } from "./columns";
import { DataTable } from "@/components/data-table";
import { BulkPriceUpdate } from "@/components/bulk-price-update";
import { AleartModal } from "@/components/modals/alert-modal";
import { toast } from "react-hot-toast";
import axios from "axios";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductClientProps {
    data: ProductColumn[]
    categories: { id: string; name: string }[]
    storeId: string;
}

export const ProductClient: React.FC<ProductClientProps> = ({
    data,
    categories,
    storeId
}) =>{

  const router = useRouter();
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredData = useMemo(() => {
    if (selectedCategory === "all") {
      return data;
    }
    return data.filter(product => product.categoryId === selectedCategory);
  }, [data, selectedCategory]);

  const handleCreate = () => {
    router.push(`/${storeId}/products/new`);
  };

  const handleBulkUpdateSuccess = () => {
    setShowBulkUpdate(false);
    router.refresh();
  };

  const handleDeleteAll = async () => {
    try {
      setIsDeleting(true);
      await axios.delete(`/api/${storeId}/products`);
      router.refresh();
      toast.success("All products deleted successfully");
    } catch (error) {
      console.error("Error deleting all products:", error);
      toast.error("Failed to delete all products");
    } finally {
      setIsDeleting(false);
      setShowDeleteAllModal(false);
    }
  };

    return (
 <div className="flex flex-col min-h-screen bg-background">  
        <main className="flex-1 p-4 md:p-8">
          <div className="rounded-lg border bg-card shadow-sm transition-all">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 md:p-6">
              <div className="flex items-center gap-2 mb-4 md:mb-0">
                <ListIcon className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-medium">Products List</h2>
              </div>
              <div className="text-sm text-muted-foreground">
                Total: {filteredData.length} {filteredData.length === 1 ? "Product" : "Products"}
              </div>
            </div>
  
            <Separator />
  
            {data.length > 0 ? (
              <div className="p-4">
                <div className="flex items-center justify-between pb-5">
                  <Heading
                    title={`Products (${filteredData.length})`}
                    description="Manage Products for your store"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowBulkUpdate(true)}>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Bulk Price Update
                    </Button>
                    <Button variant="destructive" onClick={() => setShowDeleteAllModal(true)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete All
                    </Button>
                    <Button onClick={handleCreate}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add New
                    </Button>
                  </div>
                </div>
                <Separator />
                
                {/* Category Filter */}
                <div className="flex items-center gap-4 py-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filter by Category:</span>
                  </div>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <DataTable searchKey="name" columns={columns} data={filteredData} />
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

        {/* Bulk Price Update Modal */}
        {showBulkUpdate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-background rounded-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Bulk Price Update</h2>
                  <Button variant="ghost" onClick={() => setShowBulkUpdate(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="p-6">
                <BulkPriceUpdate
                  storeId={storeId}
                  products={data}
                  onUpdateSuccess={handleBulkUpdateSuccess}
                />
              </div>
            </div>
          </div>
        )}

        {/* Delete All Products Modal */}
        <AleartModal
          isOpen={showDeleteAllModal}
          onClose={() => setShowDeleteAllModal(false)}
          onConfirm={handleDeleteAll}
          loading={isDeleting}
        />
      </div>  
    )
}