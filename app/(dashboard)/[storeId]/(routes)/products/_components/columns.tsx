"use client"

import { ColumnDef } from "@tanstack/react-table"
import { CellAction } from "./cell-action"
import Image from "next/image"
import { cn } from "@/lib/utils"

export type ProductColumn = {
  id:         string
  name:       string
  price:      string
  category:   string
  imageUrl?:  string | null
  categoryId: string
  isFeatured: string
  isArchived: string
  createdAt:  string
}

// Thumbnail helper
function Thumb({ src, alt }: { src?: string | null; alt: string }) {
  const initials = alt
    ? alt.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?"
    : "?"

  if (!src) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground">
        {initials}
      </div>
    )
  }

  return (
    <div className="relative h-10 w-10 overflow-hidden rounded-md border">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="40px"
        className={cn("object-cover")}
      />
    </div>
  )
}

export const columns: ColumnDef<ProductColumn>[] = [
  {
    id: "image",
    header: "Image",
    cell: ({ row }) => {
      const product = row.original
      return <Thumb src={product.imageUrl} alt={product.name} />
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "isArchived",
    header: "Archived",
  },
  {
    accessorKey: "isFeatured",
    header: "Featured",
  },
  {
    accessorKey: "price",
    header: "Price",
  },
  {
    accessorKey: "category",
    header: "Category",
  },
  {
    accessorKey: "createdAt",
    header: "Date",
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
]
