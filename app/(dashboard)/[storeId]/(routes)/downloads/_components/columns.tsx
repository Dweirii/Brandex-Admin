"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Download, DollarSign } from "lucide-react"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatter } from "@/lib/utils"

export type DownloadColumn = {
  id: string
  productName: string
  categoryName: string
  email: string | null
  isFree: boolean
  createdAt: Date
  price: number
}

// Cell component with truncation and tooltip for overflow text
const TruncatedCell = ({ value }: { value: string }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="max-w-[200px] truncate">{value || "-"}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs break-words">{value || "-"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export const columns: ColumnDef<DownloadColumn>[] = [
  {
    accessorKey: "productName",
    header: "Product",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-muted-foreground" />
        <TruncatedCell value={row.original.productName} />
      </div>
    ),
  },
  {
    accessorKey: "categoryName",
    header: "Category",
    cell: ({ row }) => (
      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
        {row.original.categoryName}
      </Badge>
    ),
  },
  {
    accessorKey: "isFree",
    header: "Type",
    cell: ({ row }) => {
      const isFree = row.original.isFree
      return (
        <Badge
          variant={isFree ? "default" : "secondary"}
          className={
            isFree
              ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
              : "bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20"
          }
        >
          {isFree ? (
            <>
              <Download className="h-3 w-3 mr-1" />
              Free
            </>
          ) : (
            <>
              <DollarSign className="h-3 w-3 mr-1" />
              Paid
            </>
          )}
        </Badge>
      )
    },
  },
  {
    accessorKey: "price",
    header: "Price",
    cell: ({ row }) => {
      const price = row.original.price
      return (
        <span className="font-medium">
          {price === 0 ? (
            <span className="text-muted-foreground">Free</span>
          ) : (
            formatter.format(price)
          )}
        </span>
      )
    },
  },
  {
    accessorKey: "email",
    header: "User Email",
    cell: ({ row }) => <TruncatedCell value={row.original.email || "Guest"} />,
  },
  {
    accessorKey: "createdAt",
    header: "Download Date",
    cell: ({ row }) => {
      try {
        const date = row.original.createdAt instanceof Date ? row.original.createdAt : new Date(row.original.createdAt)
        return (
          <div className="flex flex-col">
            <span className="text-sm">{format(date, "MMM d, yyyy")}</span>
            <span className="text-xs text-muted-foreground">{format(date, "h:mm a")}</span>
          </div>
        )
      } catch {
        return <span className="text-sm text-muted-foreground">—</span>
      }
    },
  },
]

