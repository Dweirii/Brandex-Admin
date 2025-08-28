"use client"

import { useState, useMemo } from "react"
import { toast } from "react-hot-toast"
import { DollarSign, Edit3, Save, X,  Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Product {
  id: string
  name: string
  price: string
  category: string
  isFeatured: string
  isArchived: string
  createdAt: string
}

interface BulkPriceUpdateProps {
  storeId: string
  products: Product[]
  onUpdateSuccess: () => void
}

interface EditableProduct extends Product {
  isEditing: boolean
  newPrice: string
  isSelected: boolean
}

export function BulkPriceUpdate({ storeId, products, onUpdateSuccess }: BulkPriceUpdateProps) {
  const [editableProducts, setEditableProducts] = useState<EditableProduct[]>(() =>
    products.map(product => ({
      ...product,
      isEditing: false,
      newPrice: product.price,
      isSelected: false
    }))
  )

  const [updating, setUpdating] = useState(false)
  const [bulkAction, setBulkAction] = useState<string>("")
  const [bulkValue, setBulkValue] = useState<string>("")

  const selectedProducts = useMemo(() => 
    editableProducts.filter(p => p.isSelected), 
    [editableProducts]
  )

  const hasChanges = useMemo(() => 
    editableProducts.some(p => p.newPrice !== p.price), 
    [editableProducts]
  )

  // تحديد/إلغاء تحديد جميع المنتجات
  const toggleSelectAll = (checked: boolean) => {
    setEditableProducts(prev => 
      prev.map(product => ({ ...product, isSelected: checked }))
    )
  }

  // تحديد/إلغاء تحديد منتج واحد
  const toggleSelectProduct = (productId: string, checked: boolean) => {
    setEditableProducts(prev => 
      prev.map(product => 
        product.id === productId ? { ...product, isSelected: checked } : product
      )
    )
  }

  // بدء تحرير منتج
  const startEditing = (productId: string) => {
    setEditableProducts(prev => 
      prev.map(product => 
        product.id === productId ? { ...product, isEditing: true } : product
      )
    )
  }

  // حفظ التغييرات في منتج
  const saveProduct = async (productId: string) => {
    const product = editableProducts.find(p => p.id === productId)
    if (!product) return

    const newPrice = parseFloat(product.newPrice)
    if (isNaN(newPrice) || newPrice < 0) {
      toast.error("Please enter a valid price (0 or greater)")
      return
    }

    setUpdating(true)
    try {
      const response = await fetch(`/api/${storeId}/products/${productId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price: newPrice,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      setEditableProducts(prev => 
        prev.map(p => 
          p.id === productId 
            ? { ...p, isEditing: false, price: product.newPrice }
            : p
        )
      )
      toast.success("Price updated successfully")
    } catch (error) {
      console.error("Update error:", error)
      toast.error("Failed to update price. Please try again.")
    } finally {
      setUpdating(false)
    }
  }

  // إلغاء التحرير
  const cancelEditing = (productId: string) => {
    setEditableProducts(prev => 
      prev.map(product => 
        product.id === productId 
          ? { ...product, isEditing: false, newPrice: product.price }
          : product
      )
    )
  }

  // تحديث السعر
  const updatePrice = (productId: string, value: string) => {
    setEditableProducts(prev => 
      prev.map(product => 
        product.id === productId ? { ...product, newPrice: value } : product
      )
    )
  }

  // تطبيق إجراء بالجملة
  const applyBulkAction = () => {
    if (!bulkAction || !bulkValue || selectedProducts.length === 0) {
      toast.error("Please select products and specify an action")
      return
    }

    const value = parseFloat(bulkValue)
    if (isNaN(value)) {
      toast.error("Please enter a valid number")
      return
    }

    setEditableProducts(prev => 
      prev.map(product => {
        if (!product.isSelected) return product

        let newPrice: number
        const currentPrice = parseFloat(product.price.replace(/[^0-9.-]+/g, ""))

        switch (bulkAction) {
          case "set":
            newPrice = value
            break
          case "add":
            newPrice = currentPrice + value
            break
          case "subtract":
            newPrice = Math.max(0, currentPrice - value)
            break
          case "multiply":
            newPrice = currentPrice * value
            break
          case "percentage":
            newPrice = currentPrice * (1 + value / 100)
            break
          default:
            return product
        }

        return {
          ...product,
          newPrice: newPrice.toFixed(2)
        }
      })
    )

    toast.success(`Applied ${bulkAction} to ${selectedProducts.length} products`)
    setBulkAction("")
    setBulkValue("")
  }

  // حفظ جميع التغييرات
  const saveAllChanges = async () => {
    const changedProducts = editableProducts.filter(p => p.newPrice !== p.price)
    
    if (changedProducts.length === 0) {
      toast.error("No changes to save")
      return
    }

    setUpdating(true)
    try {
      const updatePromises = changedProducts.map(product => 
        fetch(`/api/${storeId}/products/${product.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            price: parseFloat(product.newPrice),
          }),
        })
      )

      const results = await Promise.allSettled(updatePromises)
      const successful = results.filter(r => r.status === "fulfilled").length
      const failed = results.length - successful

      if (successful > 0) {
        // تحديث الأسعار المحفوظة
        setEditableProducts(prev => 
          prev.map(product => {
            const changedProduct = changedProducts.find(p => p.id === product.id)
            if (changedProduct) {
              return { ...product, price: product.newPrice }
            }
            return product
          })
        )
        
        toast.success(`Successfully updated ${successful} products${failed > 0 ? `, ${failed} failed` : ""}`)
        onUpdateSuccess()
      } else {
        toast.error("Failed to update any products")
      }
    } catch (error) {
      console.error("Bulk update error:", error)
      toast.error("Failed to update products. Please try again.")
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          Bulk Price Update
          <Badge variant="secondary">{products.length} products</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bulk Actions */}
        <div className="space-y-4 p-4 bg-muted rounded-lg">
          <h3 className="font-medium">Bulk Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Select value={bulkAction} onValueChange={setBulkAction}>
              <SelectTrigger>
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="set">Set to</SelectItem>
                <SelectItem value="add">Add</SelectItem>
                <SelectItem value="subtract">Subtract</SelectItem>
                <SelectItem value="multiply">Multiply by</SelectItem>
                <SelectItem value="percentage">Percentage change</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              type="number"
              step="0.01"
              placeholder="Value"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            />
            
            <Button 
              onClick={applyBulkAction}
              disabled={!bulkAction || !bulkValue || selectedProducts.length === 0}
              variant="outline"
            >
              Apply to Selected ({selectedProducts.length})
            </Button>
          </div>
        </div>

        {/* Products Table */}
        <div className="rounded-md border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedProducts.length === editableProducts.length && editableProducts.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Current Price</TableHead>
                  <TableHead>New Price</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editableProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Checkbox
                        checked={product.isSelected}
                        onCheckedChange={(checked) => toggleSelectProduct(product.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.price}</TableCell>
                    <TableCell>
                      {product.isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={product.newPrice}
                          onChange={(e) => updatePrice(product.id, e.target.value)}
                          className="w-24"
                        />
                      ) : (
                        <span className={product.newPrice !== product.price ? "text-green-600 font-medium" : ""}>
                          {product.newPrice}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>
                      {product.newPrice !== product.price ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          Modified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Unchanged</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {product.isEditing ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => saveProduct(product.id)}
                            disabled={updating}
                            className="h-8 w-8 p-0"
                          >
                            {updating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelEditing(product.id)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditing(product.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Summary and Actions */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {hasChanges && (
              <span className="text-green-600 font-medium">
                {editableProducts.filter(p => p.newPrice !== p.price).length} products modified
              </span>
            )}
          </div>
          
          <div className="flex gap-2">
            {hasChanges && (
              <Button onClick={saveAllChanges} disabled={updating}>
                {updating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save All Changes
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 