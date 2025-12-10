"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useState, useEffect } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle } from "lucide-react"
import { useSidebarState } from "@/hooks/use-sidebar"
import { format } from "date-fns"

export type OrderColumn = {
  id: string
  phone: string
  address: string
  isPaid: boolean
  totalPrice: string
  products: string
  createdAt: string
  email?: string
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

export const useColumns = () => {
  // Get sidebar state from a custom hook
  const { isOpen } = useSidebarState()
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1200)

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Determine which columns to show based on sidebar state and window width
  const getColumnVisibility = () => {
    const isMobile = windowWidth < 768
    const isTablet = windowWidth >= 768 && windowWidth < 1024
    const isDesktop = windowWidth >= 1024

    // When sidebar is open, we have less space
    if (isOpen) {
      if (isMobile) {
        return {
          products: true,
          isPaid: true,
          totalPrice: true,
          phone: false,
          address: false,
          createdAt: false,
          email: false,
        }
      } else if (isTablet) {
        return {
          products: true,
          isPaid: true,
          totalPrice: true,
          phone: true,
          address: false,
          createdAt: true,
          email: false,
        }
      }
    }

    // Default visibility for desktop or when sidebar is closed
    return {
      products: true,
      isPaid: true,
      totalPrice: true,
      phone: true,
      address: isDesktop || (isTablet && !isOpen),
      createdAt: true,
      email: isDesktop,
    }
  }

  const columnVisibility = getColumnVisibility()

  const columns: ColumnDef<OrderColumn>[] = [
    {
      accessorKey: "products",
      header: "Products",
      cell: ({ row }) => <TruncatedCell value={row.original.products} />,
    },
    {
      accessorKey: "isPaid",
      header: "Status",
      cell: ({ row }) => {
        const isPaid = row.original.isPaid
        return (
          <Badge
            variant={isPaid ? "default" : "destructive"}
            className={isPaid ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20" : ""}
          >
            {isPaid ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Paid
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Unpaid
              </>
            )}
          </Badge>
        )
      },
    },
    {
      accessorKey: "totalPrice",
      header: "Total Price",
      cell: ({ row }) => {
        return <span className="font-medium">{row.original.totalPrice}</span>
      },
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <TruncatedCell value={row.original.email || "-"} />,
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => <TruncatedCell value={row.original.phone} />,
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => <TruncatedCell value={row.original.address} />,
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => {
        try {
          const date = new Date(row.original.createdAt)
          return (
            <div className="flex flex-col">
              <span className="text-sm">{format(date, "MMM d, yyyy")}</span>
              <span className="text-xs text-muted-foreground">{format(date, "h:mm a")}</span>
            </div>
          )
        } catch {
          return <span>{row.original.createdAt}</span>
        }
      },
    },
  ]

  return { columns, columnVisibility }
}

