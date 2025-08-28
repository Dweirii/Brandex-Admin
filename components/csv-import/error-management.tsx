"use client"

import { useState, useMemo } from "react"
import { toast } from "react-hot-toast"
import { AlertCircle, Edit3, Save, X, CheckCircle, RefreshCw, Download, Search, Filter, Trash2, Copy, Wand2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  validateProductBatch, 
  type ProductImportRow,  
} from "@/lib/validation/product-import-schema"
import { exportFailedRowsAsCsv } from "@/lib/utils/export-failed-rows"

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ErrorManagementProps {
  storeId: string
  originalRows: ProductImportRow[]
  validationErrors: ValidationError[]
  onImportSuccess: () => void
}

interface EditableRow extends ProductImportRow {
  isEditing: boolean
  originalIndex: number
  uniqueId: string // إضافة معرف فريد لكل صف
}

export function ErrorManagement({ 
  storeId, 
  originalRows, 
  validationErrors, 
  onImportSuccess 
}: ErrorManagementProps) {
  const [editableRows, setEditableRows] = useState<EditableRow[]>(() => {
    const errorRowIndices = new Set(validationErrors.map(err => err.row - 1))
    return originalRows
      .map((row, index) => ({
        ...row,
        isEditing: false,
        originalIndex: index,
        uniqueId: `row-${index}-${Date.now()}`, // معرف فريد لكل صف
      }))
      .filter((_, index) => errorRowIndices.has(index))
  })

  const [importing, setImporting] = useState(false)
  const [activeTab, setActiveTab] = useState("errors")
  const [searchTerm, setSearchTerm] = useState("")
  const [errorFilter, setErrorFilter] = useState("all")
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set()) // استخدام uniqueId بدلاً من originalIndex

  const validateRow = (row: ProductImportRow): ValidationError[] => {
    const result = validateProductBatch([row])
    return result.errors.map(e => ({ ...e, row: (row as EditableRow).originalIndex + 1 }))
  }
  
  const errorTypes = useMemo(() => {
    const types = new Set<string>()
    editableRows.forEach(row => {
      validateRow(row).forEach(error => types.add(error.field))
    })
    return Array.from(types)
  }, [editableRows])
  
  const { errorRows, fixedRows } = useMemo(() => {
    const errorRows: EditableRow[] = []
    const fixedRows: EditableRow[] = []
    editableRows.forEach(row => {
      if (validateRow(row).length > 0) {
        errorRows.push(row)
      } else {
        fixedRows.push(row)
      }
    })
    return { errorRows, fixedRows }
  }, [editableRows])

  const filteredErrorRows = useMemo(() => {
    let filtered = errorRows
    if (searchTerm) {
      filtered = filtered.filter(row => 
        Object.values(row).some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()))
      )
    }
    if (errorFilter !== "all") {
      filtered = filtered.filter(row => 
        validateRow(row).some(error => error.field === errorFilter)
      )
    }
    return filtered
  }, [errorRows, searchTerm, errorFilter])

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(filteredErrorRows.map(r => r.uniqueId)))
    } else {
      setSelectedRows(new Set())
    }
  }

  const toggleSelectRow = (uniqueId: string, checked: boolean) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (checked) newSet.add(uniqueId)
      else newSet.delete(uniqueId)
      return newSet
    })
  }

  const startEditing = (uniqueId: string) => {
    setEditableRows(prev => prev.map(r => r.uniqueId === uniqueId ? { ...r, isEditing: true } : r))
  }

  const saveRow = (uniqueId: string) => {
    const rowToSave = editableRows.find(r => r.uniqueId === uniqueId)
    if (!rowToSave) return
    
    // التحقق من صحة البيانات قبل الحفظ
    const errors = validateRow(rowToSave)
    if (errors.length > 0) {
      toast.error(`Please fix the following errors: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`)
      return
    }
    
    setEditableRows(prev => prev.map(r => r.uniqueId === uniqueId ? { ...r, isEditing: false } : r))
    toast.success("Row updated successfully!")
  }

  const cancelEditing = (uniqueId: string) => {
    const originalRow = editableRows.find(r => r.uniqueId === uniqueId)
    if (!originalRow) return
    
    setEditableRows(prev => prev.map(r => 
      r.uniqueId === uniqueId 
        ? { ...originalRows[originalRow.originalIndex], isEditing: false, originalIndex: originalRow.originalIndex, uniqueId } 
        : r
    ))
  }

  const updateField = (uniqueId: string, field: keyof ProductImportRow, value: string | number | boolean) => {
    setEditableRows(prev => prev.map(r => r.uniqueId === uniqueId ? { ...r, [field]: value } : r))
  }

  const deleteSelectedRows = () => {
    setEditableRows(prev => prev.filter(r => !selectedRows.has(r.uniqueId)))
    setSelectedRows(new Set())
    toast.success(`${selectedRows.size} rows deleted.`)
  }

  const copyToSelected = (sourceUniqueId: string, field: keyof ProductImportRow) => {
    const sourceRow = editableRows.find(r => r.uniqueId === sourceUniqueId)
    if (!sourceRow) return
    const sourceValue = sourceRow[field]
    setEditableRows(prev => prev.map(r => selectedRows.has(r.uniqueId) ? { ...r, [field]: sourceValue } : r))
    toast.success(`Copied "${String(sourceValue)}" to ${selectedRows.size} selected rows.`)
  }

  const autoFixCommonErrors = () => {
    let fixesApplied = 0;
    setEditableRows(prev =>
      prev.map(row => {
        if (validateRow(row).length > 0) {
          // نقوم بإصلاح الأخطاء الشائعة مع الحفاظ على خصائص EditableRow
          const fixedRow = { ...row };

          if (parseFloat(fixedRow.price) < 0) {
            fixedRow.price = "0";
            fixesApplied++;
          }
          if (!fixedRow.name) {
            fixedRow.name = `Product ${fixedRow.originalIndex + 1}`;
            fixesApplied++;
          }
          return fixedRow;
        }
        return row;
      })
    );
    if (fixesApplied > 0)
      toast.success(`تم تطبيق ${fixesApplied} إصلاح تلقائي.`);
    else toast("لم يتم العثور على أخطاء شائعة لإصلاحها.");
  };

  const importValidRows = async () => {
    // استيراد الصفوف الصحيحة من الأصلية
    const validOriginalRows = originalRows.filter((_, index) => {
      const hasErrors = validationErrors.some(err => err.row - 1 === index)
      return !hasErrors
    })

    if (validOriginalRows.length === 0) {
      toast.error("No valid rows to import.")
      return
    }

    setImporting(true)
    const itemsToImport = validOriginalRows.map(row => ({
      ...row,
      price: parseFloat(row.price),
      isFeatured: String(row.isFeatured).toLowerCase() === 'true' || row.isFeatured === '1',
      isArchived: String(row.isArchived).toLowerCase() === 'true' || row.isArchived === '1',
      imageUrl: Array.isArray(row.imageUrl) ? row.imageUrl : (row.imageUrl ? [row.imageUrl] : []),
      keywords: Array.isArray(row.keywords) ? row.keywords : (row.keywords ? [row.keywords] : []),
    }))

    try {
      const response = await fetch(`/api/${storeId}/products/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, items: itemsToImport }),
      })
      if (!response.ok) throw new Error(await response.text())
      toast.success(`Successfully imported ${itemsToImport.length} valid products!`)
    } catch {
      console.error("Import error:")
      toast.error(`Import failed:`)
    } finally {
      setImporting(false)
    }
  }

  const importFixedRows = async () => {
    if (fixedRows.length === 0) return toast.error("No fixed rows to import.")
    
    setImporting(true)
    const itemsToImport = fixedRows.map(row => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { isEditing, originalIndex, uniqueId, ...productData } = row
      return {
        ...productData,
        price: parseFloat(row.price),
        isFeatured: String(row.isFeatured).toLowerCase() === 'true' || row.isFeatured === '1',
        isArchived: String(row.isArchived).toLowerCase() === 'true' || row.isArchived === '1',
        imageUrl: Array.isArray(row.imageUrl) ? row.imageUrl : (row.imageUrl ? [row.imageUrl] : []),
        keywords: Array.isArray(row.keywords) ? row.keywords : (row.keywords ? [row.keywords] : []),
      }
    })

    try {
      const response = await fetch(`/api/${storeId}/products/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, items: itemsToImport }),
      })
      if (!response.ok) throw new Error(await response.text())
      toast.success(`Successfully imported ${itemsToImport.length} fixed products!`)
      onImportSuccess()
    } catch {
      console.error("Import error:")
      toast.error(`Import failed:`)
    } finally {
      setImporting(false)
    }
  }

  // حساب الصفوف الصحيحة من الأصلية
  const validOriginalRowsCount = originalRows.filter((_, index) => {
    const hasErrors = validationErrors.some(err => err.row - 1 === index)
    return !hasErrors
  }).length

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Error Management
            <Badge variant="secondary">{editableRows.length} rows with errors</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">Review, edit, and fix rows that failed validation before importing.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search all fields..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <div className="flex items-center gap-2">
              <Select value={errorFilter} onValueChange={setErrorFilter}>
                <SelectTrigger className="w-full sm:w-48"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Filter by error type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Error Types</SelectItem>
                  {errorTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={autoFixCommonErrors} variant="outline"><Wand2 className="h-4 w-4 mr-2" />Auto-Fix</Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="errors"><AlertCircle className="h-4 w-4 mr-2" /> Errors ({errorRows.length})</TabsTrigger>
              <TabsTrigger value="fixed"><CheckCircle className="h-4 w-4 mr-2" /> Fixed ({fixedRows.length})</TabsTrigger>
              <TabsTrigger value="valid"><CheckCircle className="h-4 w-4 mr-2" /> Valid ({validOriginalRowsCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="errors" className="space-y-4 mt-4">
              {filteredErrorRows.length > 0 ? (
                <div className="space-y-4">
                  {selectedRows.size > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">{selectedRows.size} rows selected</span>
                      <Button size="sm" variant="destructive" onClick={deleteSelectedRows}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
                    </div>
                  )}
                  <div className="rounded-md border overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox 
                                checked={selectedRows.size > 0 && selectedRows.size === filteredErrorRows.length} 
                                onCheckedChange={c => toggleSelectAll(c as boolean)} 
                              />
                            </TableHead>
                            <TableHead>Row</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Errors</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredErrorRows.map(row => (
                            <TableRow key={row.uniqueId}>
                              <TableCell>
                                <Checkbox 
                                  checked={selectedRows.has(row.uniqueId)} 
                                  onCheckedChange={c => toggleSelectRow(row.uniqueId, c as boolean)} 
                                />
                              </TableCell>
                              <TableCell className="font-medium">{row.originalIndex + 1}</TableCell>
                              <TableCell>
                                {row.isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <Input 
                                      value={row.name} 
                                      onChange={e => updateField(row.uniqueId, 'name', e.target.value)} 
                                      className="w-full" 
                                    />
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          size="icon" 
                                          variant="ghost" 
                                          onClick={() => copyToSelected(row.uniqueId, 'name')}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Copy to selected rows</TooltipContent>
                                    </Tooltip>
                                  </div>
                                ) : (
                                  row.name
                                )}
                              </TableCell>
                              <TableCell>
                                {row.isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <Input 
                                      type="number" 
                                      step="0.01" 
                                      min="0" 
                                      value={row.price} 
                                      onChange={e => updateField(row.uniqueId, 'price', e.target.value)} 
                                      className="w-full" 
                                    />
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          size="icon" 
                                          variant="ghost" 
                                          onClick={() => copyToSelected(row.uniqueId, 'price')}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Copy to selected rows</TooltipContent>
                                    </Tooltip>
                                  </div>
                                ) : (
                                  row.price
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  {validateRow(row).map((e, i) => (
                                    <Badge key={i} variant="destructive" className="text-xs font-mono">
                                      {e.field}: {e.message}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {row.isEditing ? (
                                  <div className="flex gap-1">
                                    <Button size="icon" onClick={() => saveRow(row.uniqueId)}>
                                      <Save className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="outline" onClick={() => cancelEditing(row.uniqueId)}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button size="icon" variant="outline" onClick={() => startEditing(row.uniqueId)}>
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
                  <Button onClick={() => exportFailedRowsAsCsv(filteredErrorRows)} variant="outline">
                    <Download className="mr-2 h-4 w-4" /> Export Filtered Errors
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No errors match your filter!</h3>
                  <p className="text-muted-foreground">Try adjusting your search or filter settings.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="fixed" className="space-y-4 mt-4">
              {fixedRows.length > 0 ? (
                <div className="space-y-4">
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Ready to Import</AlertTitle>
                    <AlertDescription>{fixedRows.length} rows have been validated and are ready to be imported.</AlertDescription>
                  </Alert>
                  <div className="rounded-md border overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Row</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Category ID</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fixedRows.map(row => (
                            <TableRow key={row.uniqueId} className="border-l-4 border-l-green-500">
                              <TableCell>{row.originalIndex + 1}</TableCell>
                              <TableCell>{row.name}</TableCell>
                              <TableCell>{row.price}</TableCell>
                              <TableCell>{row.categoryId}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <Button onClick={importFixedRows} disabled={importing} className="w-full">
                    {importing ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Importing...
                      </>
                    ) : (
                      `Import ${fixedRows.length} Fixed Products`
                    )}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-orange-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No fixed rows yet</h3>
                  <p className="text-muted-foreground">Edit rows in the Errors tab to fix them.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="valid" className="space-y-4 mt-4">
              {validOriginalRowsCount > 0 ? (
                <div className="space-y-4">
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Valid Rows Ready</AlertTitle>
                    <AlertDescription>
                      {validOriginalRowsCount} rows from your original file are valid and can be imported immediately.
                    </AlertDescription>
                  </Alert>
                  <div className="rounded-md border overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Row</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Category ID</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {originalRows
                            .filter((_, index) => {
                              const hasErrors = validationErrors.some(err => err.row - 1 === index)
                              return !hasErrors
                            })
                            .slice(0, 10)
                            .map((row, index) => (
                              <TableRow key={index} className="border-l-4 border-l-blue-500">
                                <TableCell>{originalRows.indexOf(row) + 1}</TableCell>
                                <TableCell>{row.name}</TableCell>
                                <TableCell>{row.price}</TableCell>
                                <TableCell>{row.categoryId}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  {validOriginalRowsCount > 10 && (
                    <p className="text-sm text-muted-foreground text-center">
                      Showing first 10 of {validOriginalRowsCount} valid rows
                    </p>
                  )}
                  <Button onClick={importValidRows} disabled={importing} className="w-full">
                    {importing ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Importing...
                      </>
                    ) : (
                      `Import ${validOriginalRowsCount} Valid Products`
                    )}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-orange-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No valid rows found</h3>
                  <p className="text-muted-foreground">All rows in your file have validation errors.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
} 