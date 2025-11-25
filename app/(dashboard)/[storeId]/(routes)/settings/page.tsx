import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import prismadb from "@/lib/prismadb"
import { SettingsForm } from "./_components/settings-form"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Store } from "lucide-react"


interface SettingsPageProps {
  params: Promise<{ storeId: string }>
}

const SettingsPage = async ({ params }: SettingsPageProps) => {
  const { storeId } = await params

  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const store = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
  })

  if (!store) {
    redirect("/")
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1 p-4 md:p-8">
      <div className="px-4 md:px-8 pb-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="rounded-full bg-primary/10 p-2">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-medium">{store.name}</h2>
            <p className="text-sm text-muted-foreground">Store ID: {store.id}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Store Information</CardTitle>
            <CardDescription>Update your store details and preferences</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">
            <SettingsForm initialData={store} />
          </CardContent>
        </Card>

        <div className="mt-6 text-sm text-muted-foreground text-center">
          <p>Last updated: {new Date(store.updatedAt).toLocaleDateString()}</p>
        </div>
      </div>
      </main>
    </div>
  );
};

export default SettingsPage;
