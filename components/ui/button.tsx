import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const buttonVariants = cva("gz-button", { variants: { variant: { default: "gz-button-primary", secondary: "gz-button-secondary", ghost: "gz-button-ghost", destructive: "gz-button-danger" }, size: { default: "", sm: "gz-button-sm", icon: "gz-button-icon" } }, defaultVariants: { variant: "default", size: "default" } });
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={twMerge(clsx(buttonVariants({ variant, size }), className))} {...props} />;
}
