"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "cn";
import "./dropdown.css";

// Adapted from shadcn/ui's Base UI Dropdown Menu.
// https://ui.shadcn.com/docs/components/base/dropdown-menu
export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuSub = MenuPrimitive.SubmenuRoot;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export function DropdownMenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      className={cn("cursor-pointer ui-dropdown-trigger", className)}
      {...props}
    />
  );
}

export function DropdownMenuContent({
  className,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  alignOffset = 0,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset" | "alignOffset">) {
  // Share positioning and dismissal.
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="ui-dropdown-positioner"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={12}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn("ui-dropdown ui-menu-content", className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant,
  ...props
}: MenuPrimitive.Item.Props & { variant?: "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn("cursor-pointer ui-dropdown-item", className)}
      {...props}
    />
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn("cursor-pointer ui-dropdown-item", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ui-submenu-arrow" size={14} aria-hidden="true" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export function DropdownMenuSubContent(props: Parameters<typeof DropdownMenuContent>[0]) {
  return <DropdownMenuContent side="right" sideOffset={4} alignOffset={-5} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn("cursor-pointer ui-dropdown-item", className)}
      {...props}
    >
      <span>{children}</span>
      <MenuPrimitive.RadioItemIndicator className="ui-dropdown-check">
        <Check size={14} aria-hidden="true" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuSeparator(props: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className="ui-dropdown-separator"
      {...props}
    />
  );
}
