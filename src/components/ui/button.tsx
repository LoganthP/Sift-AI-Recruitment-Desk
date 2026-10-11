import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'motion/react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const spring = { type: 'spring', stiffness: 520, damping: 32 } as const;

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'clay',
        glass: 'glass text-mist hover:bg-white/10',
        ghost: 'text-muted hover:bg-white/6 hover:text-mist',
        outline: 'border border-white/15 text-mist hover:border-white/30 hover:bg-white/5',
        danger: 'text-coral hover:bg-coral/10',
      },
      size: { sm: 'h-8 rounded-xl px-3 text-xs', md: 'h-10 rounded-2xl px-4 text-sm', lg: 'h-12 rounded-2xl px-6 text-base', icon: 'size-9 rounded-xl' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type Props = Omit<HTMLMotionProps<'button'>, 'children'> &
  VariantProps<typeof buttonVariants> & { loading?: boolean; icon?: LucideIcon; iconRight?: LucideIcon; children?: React.ReactNode };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, loading, icon: Icon, iconRight: IconRight, disabled, children, ...rest },
  ref
) {
  const off = disabled || loading;
  return (
    <motion.button
      ref={ref}
      whileHover={off ? undefined : { y: -1 }}
      whileTap={off ? undefined : { scale: 0.96 }}
      transition={spring}
      disabled={off}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {variant === 'primary' && !off && (
        <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full [button:hover>&]:translate-x-full" />
      )}
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
      {IconRight && !loading && <IconRight className="size-4" />}
    </motion.button>
  );
});
