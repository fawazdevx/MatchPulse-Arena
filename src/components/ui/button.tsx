import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex touch-target items-center justify-center whitespace-nowrap rounded-2xl text-sm font-bold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(135deg,#2F8CFF,#65D7FF)] text-white shadow-[0_14px_38px_rgba(47,140,255,0.3)] hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(47,140,255,0.42)]",
        secondary: "border border-white/10 bg-white/10 text-white backdrop-blur hover:bg-white/[0.16]",
        outline: "border border-white/[0.14] bg-white/[0.06] text-white backdrop-blur hover:border-white/[0.24] hover:bg-white/[0.12]",
        ghost: "text-white/[0.78] hover:bg-white/10 hover:text-white",
        pulse: "bg-[linear-gradient(135deg,#0D1935,#142A54)] text-white shadow-[0_16px_42px_rgba(0,0,0,0.28)] hover:-translate-y-0.5 hover:brightness-110",
        success: "bg-[linear-gradient(135deg,#18B981,#59E8B4)] text-[#04120E] shadow-[0_14px_38px_rgba(24,185,129,0.28)] hover:-translate-y-0.5"
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
