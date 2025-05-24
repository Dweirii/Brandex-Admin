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
  PanelLeftClose,
  PanelLeftOpen,
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
      className="h-9 w-9 rounded-full transition-all duration-200 hover:bg-muted"
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
    >
      {open ? (
        <PanelLeftClose className="h-4 w-4 transition-transform duration-200" />
      ) : (
        <PanelLeftOpen className="h-4 w-4 transition-transform duration-200" />
      )}
    </Button>
  )
}

export function SidebarNav({ className, storeSwitcher, userButton, ...props }: SidebarNavProps) {
  const pathname = usePathname()
  const params = useParams()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const routes = [
    {
      href: `/${params.storeId}`,
      label: "Dashboard",
      icon: BarChart3,
      color: "text-blue-500 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      href: `/${params.storeId}/billboards`,
      label: "Billboards",
      icon: ImageIcon,
      color: "text-purple-500 dark:text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      href: `/${params.storeId}/categories`,
      label: "Categories",
      icon: LayoutGrid,
      color: "text-amber-500 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      href: `/${params.storeId}/products`,
      label: "Products",
      icon: Package,
      color: "text-indigo-500 dark:text-indigo-400",
      bgColor: "bg-indigo-500/10",
    },
    {
      href: `/${params.storeId}/orders`,
      label: "Orders",
      icon: ShoppingCart,
      color: "text-orange-500 dark:text-orange-400",
      bgColor: "bg-orange-500/10",
    },
    {
      href: `/${params.storeId}/import`,
      label: "Bulk Import",
      icon: ShoppingCart,
      color: "text-orange-500 dark:text-orange-400",
      bgColor: "bg-orange-500/10",
    },
    {
      href: `/${params.storeId}/settings`,
      label: "Settings",
      icon: Settings,
      color: "text-gray-500 dark:text-gray-400",
      bgColor: "bg-gray-500/10",
    },
  ]

  return (
    <Sidebar className={cn("border-r", className)} collapsible="icon" {...props}>
      {/* Header with store switcher + collapse button */}
      <SidebarHeader className="border-b p-4 flex items-center justify-between">
        <div className="flex-1 overflow-hidden truncate">{storeSwitcher}</div>
        <div className="hidden md:block">
          <CollapseButton />
        </div>
        <div className="md:hidden">
          <SidebarTrigger />
        </div>
      </SidebarHeader>

      {/* Navigation Links */}
      <SidebarContent className="py-2">
        <SidebarMenu>
          {routes.map((route) => {
            const isActive = pathname === route.href
            return (
              <SidebarMenuItem key={route.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={route.label}
                  className={cn(
                    "transition-all duration-200 relative",
                    isActive ? "font-medium" : "font-normal hover:bg-muted/50",
                  )}
                >
                  <Link href={route.href} className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex items-center justify-center relative",
                        isCollapsed ? "mx-auto" : "",
                        isActive ? cn(route.color, route.bgColor, "rounded-md p-1") : "text-muted-foreground p-1",
                      )}
                    >
                      <route.icon className={cn("h-5 w-5 transition-all", isActive && "scale-110")} />
                    </div>
                    <span className={cn("truncate transition-all", isActive ? route.color : "text-foreground")}>
                      {route.label}
                    </span>
                    {isActive && !isCollapsed && (
                      <span className="absolute inset-y-0 left-0 w-1 rounded-r-md bg-primary" />
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer (user button) */}
      <SidebarFooter className="border-t p-4">{userButton}</SidebarFooter>
    </Sidebar>
  )
}

