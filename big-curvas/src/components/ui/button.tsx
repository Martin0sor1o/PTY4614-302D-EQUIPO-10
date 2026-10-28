import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Botones en píldora (dirección D). Escritorio conserva la densidad de siempre; bajo el breakpoint móvil
// (md) todos miden al menos 44 px de alto. El foco lo dibuja la regla global :focus-visible (2 px sólido).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors outline-none select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Los colores de borde se fijan por variante (sin `border-transparent` en la base): `buttonVariants()` se usa también
        // sin tailwind-merge en <Link>, y dos clases de borde a la vez dejaban el borde del outline invisible.
        default: "border-transparent bg-primary text-primary-foreground shadow-button hover:bg-primary-hover",
        onDark:
          "border-brand-pink/60 bg-transparent text-brand-pink hover:bg-brand-pink hover:text-brand-black",
        outline:
          "border-input bg-card hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "border-transparent hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground",
        destructive:
          "border-transparent bg-tone-danger-soft text-tone-danger hover:bg-tone-danger/20",
        danger: "border-transparent bg-tone-danger text-tone-danger-foreground hover:bg-tone-danger/90",
        link: "border-transparent text-brand-ink underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3.5 max-md:h-11 max-md:px-4 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs max-md:h-11 max-md:px-3 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[0.8rem] max-md:h-11 max-md:px-3.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-4 max-md:h-11 max-md:px-5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 max-md:size-11",
        "icon-xs": "size-6 max-md:size-11 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 max-md:size-11",
        "icon-lg": "size-9 max-md:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
