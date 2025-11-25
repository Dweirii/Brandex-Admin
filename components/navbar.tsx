import { UserButton } from "@clerk/nextjs"
import StoreSwitcher from "@/components/store-switcher"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import prismadb from "@/lib/prismadb"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/sidebar-nav"
import { cookies } from "next/headers"
import type { Store } from "@prisma/client"

const Navbar = async () => {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  let stores: Store[] = []

  try {
    stores = await prismadb.store.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: "asc",
      },
    })
  } catch (error) {
    console.error("Failed to fetch stores:", error)
  }

  const cookieStore = cookies()
  let defaultOpen = true

  try {
    const sidebarCookie = (await cookieStore).get("sidebar:state")
    defaultOpen = sidebarCookie ? sidebarCookie.value === "true" : true
  } catch (error) {
    console.error("Failed to read sidebar cookie:", error)
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <SidebarNav
        storeSwitcher={<StoreSwitcher items={stores} />}
        userButton={
          <div className="flex items-center justify-center">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonAvatarBox: "h-8 w-8",
                },
              }}
            />
          </div>
        }
      />
    </SidebarProvider>
  )
}

export default Navbar

