// app/(dashboard)/[storeId]/(routes)/CSV/page.tsx

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prismadb from "@/lib/prismadb";
import CsvImportPage from "@/components/csv-import/csv-import-page";

// ✅ Important: Next.js 15 passes params as Promise
interface ImportPageProps {
  params: Promise<{
    storeId: string;
  }>;
}

export default async function ImportPage({ params }: ImportPageProps) {
  const { storeId } = await params; // ✅ await the params

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

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CsvImportPage storeId={storeId} />
      </div>
    </div>
  );
}
