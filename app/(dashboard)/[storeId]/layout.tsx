import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prismadb from "@/lib/prismadb";

import Navbar from "@/components/navbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import ContentWithSidebarPadding from "@/components/ContentWithSidebarPadding";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect(`/sign-in`);
  }

  const { storeId } = await params;

  const store = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!store) {
    redirect(`/`);
  }

  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen">
        <Navbar />
        <ContentWithSidebarPadding>{children}</ContentWithSidebarPadding>
      </div>
    </SidebarProvider>
  );
}
