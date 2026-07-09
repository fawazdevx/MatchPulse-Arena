import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex touch-target min-w-0 items-center justify-center whitespace-normal rounded-2xl text-center text-sm font-bold leading-tight ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(135deg,#16A86F,#22D391)] text-[#03110C] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.28),0_14px_40px_-12px_rgba(34,211,145,0.48)] motion-safe:hover:-translate-y-0.5 hover:brightness-110",
        secondary: "border border-white/[0.08] bg-surface-muted text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/[0.14] hover:bg-surface-elevated",
        outline: "border border-white/[0.1] bg-surface/60 text-white hover:border-white/[0.2] hover:bg-surface-muted",
        ghost: "text-white/[0.78] hover:bg-surface-muted hover:text-white",
        pulse: "bg-[linear-gradient(135deg,#10231E,#1D3F35)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_42px_rgba(0,0,0,0.34)] motion-safe:hover:-translate-y-0.5 hover:brightness-110",
        success: "bg-[linear-gradient(135deg,#22D391,#FFD166)] text-[#03110C] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.32),0_14px_36px_-12px_rgba(34,211,145,0.5)] motion-safe:hover:-translate-y-0.5 hover:brightness-110"
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-10 rounded-xl px-3.5",
        lg: "h-13 rounded-2xl px-8 py-3 text-base",
        icon: "h-11 w-11"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
