"use client"

import type React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Heading } from "@/components/ui/heading"
import { Separator } from "@/components/ui/separator"
import { type DownloadColumn, columns } from "./columns"
import { DataTable } from "@/components/data-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DownloadClientProps {
  data: DownloadColumn[]
  categories: Array<{ id: string; name: string }>
  selectedCategoryId?: string
}

export const DownloadClient: React.FC<DownloadClientProps> = ({
  data,
  categories,
  selectedCategoryId,
}) => {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleCategoryChange = (categoryId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (categoryId === "all" || !categoryId) {
      params.delete("category")
    } else {
      params.set("category", categoryId)
    }

    router.push(`?${params.toString()}`)
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5">
        <Heading
          title={`Downloads (${data.length})`}
          description="View and filter all product downloads"
        />
        <div className="flex items-center gap-2">
          <Select
            value={selectedCategoryId || "all"}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by category" />
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
      </div>
      <Separator />
      <DataTable searchKey="productName" columns={columns} data={data} />
    </>
  )
}

