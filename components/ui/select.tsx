"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "cn";
import "./dropdown.css";

// Adapted from shadcn/ui's Base UI Select.
// https://ui.shadcn.com/docs/components/base/select
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn("cursor-pointer ui-select-trigger", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown size={15} aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  // Portal outside clipped surfaces.
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="ui-dropdown-positioner"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        collisionPadding={12}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn("ui-dropdown ui-select-content", className)}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="ui-select-scroll">
            <ChevronUp size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List className="ui-select-list">{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="ui-select-scroll">
            <ChevronDown size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn("cursor-pointer ui-dropdown-item", className)}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ui-dropdown-check">
        <Check size={14} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectFieldProps = Pick<
  SelectPrimitive.Trigger.Props,
  "id" | "aria-label" | "aria-labelledby" | "aria-describedby" | "className" | "disabled" | "title"
> & {
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
};

/** Controlled option fields share the same composition and label mapping. */
export function SelectField({
  value,
  options,
  onValueChange,
  disabled,
  ...props
}: SelectFieldProps) {
  // Compose the option field.
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      modal={false}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <SelectTrigger disabled={disabled} {...props}>
        <SelectValue data-slot="select-value" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
