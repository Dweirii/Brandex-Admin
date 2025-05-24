import { BillboardClient } from "./_components/client";
import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import type { BillboardColumn } from "./_components/columns";

const BillboardsPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;

  const billboards = await prismadb.billboard.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });

  const formattedBillboard: BillboardColumn[] = billboards.map((item) => ({
    id: item.id,
    label: item.label,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }));

  return <BillboardClient data={formattedBillboard} storeId={storeId} />;
};

export default BillboardsPage;
