"use client";

import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { cn } from "@/lib/utils";
import { useIcon } from "@/lib/icon-context";
import { useShape } from "@/lib/shape-context";
import { fontWeights } from "@/lib/font-weight";

interface AccordionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  type?: "single" | "multiple";
  collapsible?: boolean;
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: ((value: string) => void) | ((value: string[]) => void);
}

const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      children,
      type = "single",
      defaultValue,
      value,
      onValueChange,
      className,
      ...props
    },
    ref,
  ) => {
    const multiple = type === "multiple";
    const normalizedValue =
      value === undefined ? undefined : Array.isArray(value) ? value : value ? [value] : [];
    const normalizedDefaultValue =
      defaultValue === undefined
        ? undefined
        : Array.isArray(defaultValue)
          ? defaultValue
          : defaultValue
            ? [defaultValue]
            : [];

    return (
      <AccordionPrimitive.Root
        multiple={multiple}
        value={normalizedValue}
        defaultValue={normalizedDefaultValue}
        onValueChange={(next) => {
          if (!onValueChange) return;
          if (multiple) {
            (onValueChange as (value: string[]) => void)(next as string[]);
            return;
          }
          (onValueChange as (value: string) => void)((next as string[])[0] ?? "");
        }}
        render={
          <div
            ref={ref}
            className={cn("flex w-72 max-w-full flex-col gap-0.5", className)}
            {...props}
          />
        }
      >
        {children}
      </AccordionPrimitive.Root>
    );
  },
);
Accordion.displayName = "Accordion";

const AccordionGroup = Accordion;

interface AccordionItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  index?: number;
  disabled?: boolean;
  children: ReactNode;
}

const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, disabled, children, className, ...props }, ref) => {
    const shape = useShape();

    return (
      <AccordionPrimitive.Item
        ref={ref}
        value={value}
        disabled={disabled}
        className={cn("relative", shape.bg, "data-[open]:bg-accent/20", className)}
        {...props}
      >
        {children}
      </AccordionPrimitive.Item>
    );
  },
);
AccordionItem.displayName = "AccordionItem";

interface AccordionTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const ChevronRight = useIcon("chevron-right");
    const shape = useShape();

    return (
      <AccordionPrimitive.Header render={<div />}>
        <AccordionPrimitive.Trigger
          ref={ref}
          className={cn(
            "group/accordion-trigger relative z-10 flex w-full cursor-pointer select-none items-center gap-2.5 px-3 py-2 text-left text-[13px] outline-none transition-colors duration-80 hover:bg-hover focus-visible:ring-1 focus-visible:ring-[#6B97FF]",
            shape.item,
            className,
          )}
          {...props}
        >
          <span className="inline-grid flex-1">
            <span
              className="invisible col-start-1 row-start-1"
              style={{ fontVariationSettings: fontWeights.semibold }}
              aria-hidden="true"
            >
              {children}
            </span>
            <span
              className="col-start-1 row-start-1 text-muted-foreground transition-[color,font-variation-settings] duration-80 group-data-[panel-open]/accordion-trigger:text-foreground"
              style={{ fontVariationSettings: fontWeights.normal }}
            >
              {children}
            </span>
          </span>
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-muted-foreground transition-[color,transform,stroke-width] duration-80 group-data-[panel-open]/accordion-trigger:rotate-90 group-data-[panel-open]/accordion-trigger:text-foreground group-data-[panel-open]/accordion-trigger:stroke-[2]"
          />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
    );
  },
);
AccordionTrigger.displayName = "AccordionTrigger";

interface AccordionContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const AccordionContent = forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ children, className, ...props }, ref) => (
    <AccordionPrimitive.Panel
      ref={ref}
      className={cn("overflow-hidden px-3 pb-3 pt-1 text-[13px] text-muted-foreground", className)}
      {...props}
    >
      {children}
    </AccordionPrimitive.Panel>
  ),
);
AccordionContent.displayName = "AccordionContent";

export {
  Accordion,
  AccordionGroup,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
};
export default Accordion;
