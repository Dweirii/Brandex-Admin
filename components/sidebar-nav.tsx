"use client"

import type React from "react"
import { useParams, usePathname } from "next/navigation"
import Link from "next/link"
import {
  BarChart3,
  ImageIcon,
  LayoutGrid,
  Package,
  Settings,
  ShoppingCart,
  ChevronLeft,
  Import,
  Download,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  storeSwitcher?: React.ReactNode
  userButton?: React.ReactNode
}

function CollapseButton() {
  const { open, setOpen } = useSidebar()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setOpen(!open)}
      className="h-8 w-8 hover:bg-accent transition-colors"
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
    >
      <ChevronLeft 
        className={cn(
          "h-4 w-4 transition-transform duration-200",
          !open && "rotate-180"
        )} 
      />
    </Button>
  )
}

export function SidebarNav({ className, storeSwitcher, userButton, ...props }: SidebarNavProps) {
  const pathname = usePathname()
  const params = useParams()

  const routes = [
    {
      href: `/${params.storeId}`,
      label: "Dashboard",
      icon: BarChart3,
    },
    {
      href: `/${params.storeId}/billboards`,
      label: "Billboards",
      icon: ImageIcon,
    },
    {
      href: `/${params.storeId}/categories`,
      label: "Categories",
      icon: LayoutGrid,
    },
    {
      href: `/${params.storeId}/products`,
      label: "Products",
      icon: Package,
    },
    {
      href: `/${params.storeId}/orders`,
      label: "Orders",
      icon: ShoppingCart,
    },
    {
      href: `/${params.storeId}/downloads`,
      label: "Downloads",
      icon: Download,
    },
    {
      href: `/${params.storeId}/CSV`,
      label: "Bulk Import",
      icon: Import,
    },
    {
      href: `/${params.storeId}/settings`,
      label: "Settings",
      icon: Settings,
    },
  ]

  return (
    <Sidebar className={cn("border-r", className)} collapsible="icon" {...props}>
      {/* Header with store switcher + collapse button */}
      <SidebarHeader className=" p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {storeSwitcher}
          </div>
          <div className="hidden md:flex">
            <CollapseButton />
          </div>
          <div className="md:hidden">
            <SidebarTrigger />
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation Links */}
      <SidebarContent className="px-3 py-4">
        <SidebarMenu className="gap-1">
          {routes.map((route) => {
            const isActive = pathname === route.href
            return (
              <SidebarMenuItem key={route.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={route.label}
                  className={cn(
                    "transition-colors duration-150",
                    isActive && "bg-accent text-accent-foreground font-medium"
                  )}
                >
                  <Link href={route.href} className="flex items-center gap-3">
                    <route.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">
                      {route.label}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer (user button) */}
      <SidebarFooter className="border-t p-3">
        {userButton}
      </SidebarFooter>
    </Sidebar>
  )
}

