"use client"

import { useMemo, useState } from "react"
import { toast } from "react-hot-toast"
import { DollarSign, Edit3, Save, X, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type ID = string

interface Product {
  id: ID
  name: string
  price: string // may include symbols, e.g. "$12.00"
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

type BulkAction = "set" | "add" | "subtract" | "multiply" | "percentage"
type PriceFilter = "__ALL__" | "FREE" | "PAID"

function parseCurrency(input: string): number {
  if (typeof input !== "string") return 0
  const cleaned = input.replace(/[^0-9.+-]/g, "")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0.00"
  return n.toFixed(2)
}

export function BulkPriceUpdate({ storeId, products, onUpdateSuccess }: BulkPriceUpdateProps) {
  const [editableProducts, setEditableProducts] = useState<EditableProduct[]>(
    () =>
      products.map((p) => ({
        ...p,
        isEditing: false,
        newPrice: p.price,
        isSelected: false,
      }))
  )

  const [updating, setUpdating] = useState(false)
  const [bulkAction, setBulkAction] = useState<BulkAction | "">("")
  const [bulkValue, setBulkValue] = useState<string>("")

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("__ALL__")
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("__ALL__")

  const categories = useMemo(() => {
    const set = new Set(editableProducts.map((p) => p.category).filter(Boolean))
    return ["__ALL__", ...Array.from(set)]
  }, [editableProducts])

  const filteredProducts = useMemo(() => {
    let list = editableProducts
    if (selectedCategory !== "__ALL__") {
      list = list.filter((p) => p.category === selectedCategory)
    }
    if (priceFilter === "FREE") {
      list = list.filter((p) => parseCurrency(p.price) === 0)
    } else if (priceFilter === "PAID") {
      list = list.filter((p) => parseCurrency(p.price) > 0)
    }
    return list
  }, [editableProducts, selectedCategory, priceFilter])

  const selectedProducts = useMemo(
    () => filteredProducts.filter((p) => p.isSelected),
    [filteredProducts]
  )
  const hasChanges = useMemo(
    () => editableProducts.some((p) => p.newPrice !== p.price),
    [editableProducts]
  )
  const modifiedCount = useMemo(
    () => editableProducts.filter((p) => p.newPrice !== p.price).length,
    [editableProducts]
  )

  const toggleSelectAll = (checked: boolean | "indeterminate") => {
    const val = checked === true
    setEditableProducts((prev) =>
      prev.map((p) => {
        const inView =
          (selectedCategory === "__ALL__" || p.category === selectedCategory) &&
          (priceFilter === "__ALL__"
            ? true
            : priceFilter === "FREE"
              ? parseCurrency(p.price) === 0
              : parseCurrency(p.price) > 0)
        return inView ? { ...p, isSelected: val } : p
      })
    )
  }

  const toggleSelectProduct = (productId: ID, checked: boolean | "indeterminate") => {
    const val = checked === true
    setEditableProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, isSelected: val } : p)))
  }

  const startEditing = (productId: ID) => {
    setEditableProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, isEditing: true } : p)))
  }

  const cancelEditing = (productId: ID) => {
    setEditableProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isEditing: false, newPrice: p.price } : p))
    )
  }

  const updatePrice = (productId: ID, value: string) => {
    setEditableProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, newPrice: value } : p)))
  }

  // Single item save
  const saveProduct = async (productId: ID) => {
    const product = editableProducts.find((p) => p.id === productId)
    if (!product) return

    const newPriceNum = parseCurrency(product.newPrice)
    if (newPriceNum < 0 || !Number.isFinite(newPriceNum)) {
      toast.error("Please enter a valid price (0 or greater)")
      return
    }

    setUpdating(true)
    try {
      const res = await fetch(`/api/${storeId}/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: Number(fmt(newPriceNum)) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setEditableProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, isEditing: false, price: fmt(newPriceNum), newPrice: fmt(newPriceNum) } : p
        )
      )
      toast.success("Price updated")
    } catch (e) {
      console.error(e)
      toast.error("Failed to update price")
    } finally {
      setUpdating(false)
    }
  }

  // Client-side transforms
  function transformPrice(currentPriceStr: string, action: BulkAction, valueStr: string): string {
    const current = parseCurrency(currentPriceStr)
    const val = parseCurrency(valueStr)
    if (!Number.isFinite(current) || !Number.isFinite(val)) return currentPriceStr

    let next = current
    switch (action) {
      case "set":
        next = val
        break
      case "add":
        next = current + val
        break
      case "subtract":
        next = Math.max(0, current - val)
        break
      case "multiply":
        next = current * val
        break
      case "percentage":
        next = current * (1 + val / 100)
        break
    }
    if (next < 0) next = 0
    return fmt(next)
  }

  const applyBulkActionToSelected = () => {
    if (!bulkAction || !bulkValue || selectedProducts.length === 0) {
      toast.error("Select products and specify an action/value")
      return
    }

    setEditableProducts((prev) =>
      prev.map((p) => (p.isSelected ? { ...p, newPrice: transformPrice(p.price, bulkAction, bulkValue) } : p))
    )
    toast.success(`Applied ${bulkAction} to ${selectedProducts.length} products`)
    setBulkAction("")
    setBulkValue("")
  }

  const applyBulkToScope = (scope: "ALL" | "CATEGORY" | "FILTERED") => {
    if (!bulkAction || !bulkValue) {
      toast.error("Pick an action and value")
      return
    }

    setEditableProducts((prev) =>
      prev.map((p) => {
        const inCategory = selectedCategory === "__ALL__" || p.category === selectedCategory
        const inPrice =
          priceFilter === "__ALL__"
            ? true
            : priceFilter === "FREE"
              ? parseCurrency(p.price) === 0
              : parseCurrency(p.price) > 0

        const apply =
          scope === "ALL"
            ? true
            : scope === "CATEGORY"
              ? inCategory
              : inCategory && inPrice // FILTERED = category + price filter

        if (!apply) return p
        return { ...p, newPrice: transformPrice(p.price, bulkAction, bulkValue) }
      })
    )

    const scopeLabel =
      scope === "ALL"
        ? "all products"
        : scope === "CATEGORY"
          ? selectedCategory === "__ALL__" ? "all products" : `category "${selectedCategory}"`
          : `current filter (${selectedCategory === "__ALL__" ? "All categories" : selectedCategory} + ${priceFilter})`

    toast.success(`Applied ${bulkAction} to ${scopeLabel}`)
    setBulkAction("")
    setBulkValue("")
  }

  // Save all changes (bulk first, fallback per-item)
  const saveAllChanges = async () => {
    const changed = editableProducts
      .filter((p) => p.newPrice !== p.price)
      .map((p) => ({ id: p.id, price: Number(fmt(parseCurrency(p.newPrice))) }))

    if (changed.length === 0) {
      toast.error("No changes to save")
      return
    }

    setUpdating(true)
    try {
      const bulkRes = await fetch(`/api/${storeId}/products/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: changed }),
      })

      if (!bulkRes.ok) {
        // fallback
        const reqs = changed.map((c) =>
          fetch(`/api/${storeId}/products/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ price: c.price }),
          })
        )
        const results = await Promise.allSettled(reqs)
        const okCount = results.filter((r) => r.status === "fulfilled").length
        if (okCount === 0) throw new Error("All updates failed")
      }

      setEditableProducts((prev) =>
        prev.map((p) => {
          const found = changed.find((c) => c.id === p.id)
          return found ? { ...p, price: fmt(found.price), newPrice: fmt(found.price), isEditing: false } : p
        })
      )
      toast.success(`Saved ${changed.length} change${changed.length > 1 ? "s" : ""}`)
      onUpdateSuccess()
    } catch (e) {
      console.error(e)
      toast.error("Failed to save changes")
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Bulk Price Update
            <Badge variant="secondary">{filteredProducts.length} products</Badge>
          </CardTitle>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Category</span>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat === "__ALL__" ? "All categories" : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Price</span>
              <Select value={priceFilter} onValueChange={(v) => setPriceFilter(v as PriceFilter)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">All</SelectItem>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Bulk Actions */}
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <h3 className="font-medium">Bulk Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <Select value={bulkAction} onValueChange={(v) => setBulkAction(v as BulkAction)}>
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
              onClick={applyBulkActionToSelected}
              disabled={!bulkAction || !bulkValue || selectedProducts.length === 0}
              variant="outline"
            >
              Apply to Selected ({selectedProducts.length})
            </Button>

            <Button
              onClick={() => applyBulkToScope("CATEGORY")}
              disabled={!bulkAction || !bulkValue}
              variant="outline"
            >
              Apply to Category
            </Button>

            <Button
              onClick={() => applyBulkToScope("FILTERED")}
              disabled={!bulkAction || !bulkValue}
              variant="outline"
            >
              Apply to Current Filter
            </Button>

            <Button onClick={() => applyBulkToScope("ALL")} disabled={!bulkAction || !bulkValue}>
              Apply to All
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
                      checked={
                        filteredProducts.length > 0 &&
                        filteredProducts.every((p) => p.isSelected)
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all in view"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Current Price</TableHead>
                  <TableHead>New Price</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Free/Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredProducts.map((product) => {
                  const isFree = parseCurrency(product.price) === 0
                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={product.isSelected}
                          onCheckedChange={(v) => toggleSelectProduct(product.id, v)}
                          aria-label={`Select ${product.name}`}
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
                            className="w-28"
                          />
                        ) : (
                          <span
                            className={
                              product.newPrice !== product.price ? "text-green-600 font-medium" : ""
                            }
                          >
                            {product.newPrice}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>{product.category}</TableCell>

                      <TableCell>
                        {isFree ? (
                          <Badge variant="outline" className="text-blue-600 border-blue-600">Free</Badge>
                        ) : (
                          <Badge variant="secondary">Paid</Badge>
                        )}
                      </TableCell>

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
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {hasChanges && (
              <span className="text-green-600 font-medium">
                {modifiedCount} product{modifiedCount !== 1 ? "s" : ""} modified
              </span>
            )}
          </div>

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
      </CardContent>
    </Card>
  )
}
