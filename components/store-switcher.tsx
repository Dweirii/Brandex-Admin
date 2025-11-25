"use client"

import type React from "react"
import type { Store } from "@prisma/client"
import { useParams, useRouter } from "next/navigation"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useStoreModal } from "@/hooks/use-store-modal"
import { useState } from "react"
import { Button } from "./ui/button"
import { Check, ChevronsUpDown, StoreIcon, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command"
import { useSidebar } from "@/components/ui/sidebar"

type PopoverTriggerProps = React.ComponentPropsWithoutRef<typeof PopoverTrigger>

interface StoreSwitcherProps extends PopoverTriggerProps {
  items: Store[]
}

export default function StoreSwitcher({ className, items = [] }: StoreSwitcherProps) {
  const storeModal = useStoreModal()
  const params = useParams()
  const router = useRouter()
  const { open: isSidebarOpen } = useSidebar()
  const [openPopover, setOpenPopover] = useState(false)

  const formattedItems = items.map((item) => ({
    label: item.name,
    value: item.id,
  }))

  const currentStore = formattedItems.find((item) => item.value === params.storeId)

  const onStoreSelect = (store: { value: string; label: string }) => {
    setOpenPopover(false)
    router.push(`/${store.value}`)
  }

  if (!isSidebarOpen) return null

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={openPopover}
          aria-label="Select a store"
          className={cn(
            "w-full justify-between",
            className,
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <StoreIcon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate text-sm">
              {currentStore ? currentStore.label : "Select store"}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search stores..." />
          <CommandList>
            <CommandEmpty>No stores found.</CommandEmpty>
            <CommandGroup heading="Stores">
              {formattedItems.map((store) => (
                <CommandItem
                  key={store.value}
                  value={store.label}
                  onSelect={() => onStoreSelect(store)}
                  className="text-sm"
                >
                  <StoreIcon className="mr-2 h-4 w-4" />
                  <span>{store.label}</span>
                  {currentStore?.value === store.value && (
                    <Check className="ml-auto h-4 w-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <CommandSeparator />
          <CommandList>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpenPopover(false)
                  storeModal.onOpen()
                }}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Store
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

