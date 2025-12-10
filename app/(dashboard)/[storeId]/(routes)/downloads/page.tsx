import { notFound } from "next/navigation"
import Link from "next/link"
import { getDownloads } from "@/actions/get-downloads"
import { DownloadClient } from "./_components/client"
import type { DownloadColumn } from "./_components/columns"
import prismadb from "@/lib/prismadb"
import { DownloadIcon, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface DownloadsPageProps {
  params: Promise<{ storeId: string }>
  searchParams: Promise<{ category?: string }>
}

export default async function DownloadsPage({ params, searchParams }: DownloadsPageProps) {
  const { storeId } = await params
  const { category } = await searchParams

  if (!storeId) notFound()

  // Fetch downloads with optional category filter
  const downloads = await getDownloads(storeId, category || undefined)

  // Fetch all categories for the filter dropdown
  const categories = await prismadb.category.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  })

  // Format downloads for the table
  const formattedDownloads: DownloadColumn[] = downloads.map((download) => ({
    id: download.id,
    productName: download.productName,
    categoryName: download.categoryName,
    email: download.email,
    isFree: download.isFree,
    createdAt: download.createdAt,
    price: download.price,
  }))

  // Calculate statistics
  const totalDownloads = formattedDownloads.length
  const freeDownloads = formattedDownloads.filter((d) => d.isFree).length
  const paidDownloads = totalDownloads - freeDownloads

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {totalDownloads > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 md:p-8 pb-0 md:pb-0">
          <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Downloads</p>
              <p className="text-2xl font-bold">{totalDownloads.toLocaleString()}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-2">
              <DownloadIcon className="h-5 w-5 text-primary" />
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Free Downloads</p>
              <p className="text-2xl font-bold">{freeDownloads.toLocaleString()}</p>
            </div>
            <div className="rounded-full bg-green-500/10 p-2">
              <Package className="h-5 w-5 text-green-500" />
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Paid Downloads</p>
              <p className="text-2xl font-bold">{paidDownloads.toLocaleString()}</p>
            </div>
            <div className="rounded-full bg-purple-500/10 p-2">
              <DownloadIcon className="h-5 w-5 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 md:p-8">
        <div className="rounded-lg border bg-card shadow-sm transition-all">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <DownloadIcon className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-medium">Download History</h2>
            </div>
          </div>

          <Separator />

          {formattedDownloads.length > 0 ? (
            <div className="p-4">
              <DownloadClient
                data={formattedDownloads}
                categories={categories}
                selectedCategoryId={category}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="rounded-full bg-primary/10 p-3 mb-4">
                <DownloadIcon className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">No downloads found</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                {category
                  ? "No downloads found for the selected category. Try selecting a different category."
                  : "Your store hasn't received any downloads yet. Downloads will appear here once customers download products."}
              </p>
              {category && (
                <Link href="?">
                  <Button variant="outline">Clear Filter</Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
