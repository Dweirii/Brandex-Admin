import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prismadb from "@/lib/prismadb";
import CsvImportPage from "@/components/csv-import/csv-import-page";
import CsvMakerPage from "@/components/csv-maker/csv-maker-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Import, Wand2 } from "lucide-react";

interface ImportPageProps {
  params: Promise<{
    storeId: string;
  }>;
}

export default async function ImportPage({ params }: ImportPageProps) {
  const { storeId } = await params;

  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const store = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
  });

  if (!store) {
    redirect("/dashboard");
  }

  // Fetch categories for CSV Maker
  const categories = await prismadb.category.findMany({
    where: { storeId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Import className="h-4 w-4" />
              Bulk Import
            </TabsTrigger>
            <TabsTrigger value="maker" className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              CSV Maker (AI)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="import" className="mt-6">
            <CsvImportPage storeId={storeId} />
          </TabsContent>
          <TabsContent value="maker" className="mt-6">
            <CsvMakerPage storeId={storeId} categories={categories} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
