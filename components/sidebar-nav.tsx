"use client"

import type React from "react"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"

import {
  BarChart3,
  ImageIcon,
  LayoutGrid,
  Package,
  Settings,
  ShoppingCart,
  PanelLeftClose,
  PanelLeftOpen,
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
  const { storeId } = useParams() as { storeId: string }
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  if (!storeId) return null

  const routes = [
    {
      href: `/${storeId}`,
      label: "Dashboard",
      icon: BarChart3,
      color: "text-blue-500 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
    },
    {
      href: `/${storeId}/billboards`,
      label: "Billboards",
      icon: ImageIcon,
      color: "text-purple-500 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
    },
    {
      href: `/${storeId}/categories`,
      label: "Categories",
      icon: LayoutGrid,
      color: "text-amber-500 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
    },
    {
      href: `/${storeId}/products`,
      label: "Products",
      icon: Package,
      color: "text-indigo-500 dark:text-indigo-400",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/20",
    },
    {
      href: `/${storeId}/orders`,
      label: "Orders",
      icon: ShoppingCart,
      color: "text-orange-500 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900/20",
    },
    {
      href: `/${storeId}/downloads`,
      label: "Downloads",
      icon: Download,
      color: "text-yellow-700 dark:text-yellow-400",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/20",
    },
    {
      href: `/${storeId}/CSV`,
      label: "Bulk Import",
      icon: Import,
      color: "text-pink-500 dark:text-pink-400",
      bgColor: "bg-pink-100 dark:bg-pink-900/20",
    },
    {
      href: `/${storeId}/settings`,
      label: "Settings",
      icon: Settings,
      color: "text-gray-500 dark:text-gray-400",
      bgColor: "bg-gray-100 dark:bg-gray-900/20",
    },
  ]

  return (
    <Sidebar className={cn("border-r", className)} collapsible="icon" {...props}>
      {/* Header */}
      <SidebarHeader className="border-b p-4 flex items-center justify-between">
        <div className="flex-1 overflow-hidden truncate">{storeSwitcher}</div>
        <div className="hidden md:block">
          <CollapseButton />
        </div>
        <div className="md:hidden">
          <SidebarTrigger />
        </div>
      </SidebarHeader>

      {/* Links */}
      <SidebarContent className="py-2">
        <SidebarMenu>
          {routes.map((route) => {
            const isActive = pathname?.startsWith(route.href)
            return (
              <SidebarMenuItem key={route.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={route.label}
                  className={cn(
                    "transition-all duration-200 relative",
                    isActive ? "font-medium" : "font-normal hover:bg-muted/50"
                  )}
                >
                  <Link href={route.href} className="flex items-center gap-3">
                    {/* Icon */}
                    <div
                      className={cn(
                        "flex items-center justify-center relative transition-all duration-200",
                        isCollapsed ? "mx-auto" : "ml-1",
                        isActive ? cn(route.color, route.bgColor, "rounded-md p-1") : "text-muted-foreground"
                      )}
                    >
                      <route.icon className={cn("h-5 w-5", isActive && "scale-110")} />
                    </div>

                    {/* Label */}
                    <span
                      className={cn(
                        "truncate transition-all",
                        isActive ? route.color : "text-foreground"
                      )}
                    >
                      {route.label}
                    </span>

                    {/* Indicator */}
                    {isActive && (
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 w-1 rounded-r-md bg-primary transition-all",
                          isCollapsed && "hidden"
                        )}
                      />
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t p-4">{userButton}</SidebarFooter>
    </Sidebar>
  )
}
