import { useRef } from 'react';
import { cn } from '@/lib/utils';

/** Glass card with a cursor-following spotlight on the surface and border. */
export function SpotlightCard({ className, children, color = '52 211 180', ...rest }: React.HTMLAttributes<HTMLDivElement> & { color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onPointerMove={move}
      className={cn('glass group/spot relative overflow-hidden rounded-3xl', className)}
      style={{ ['--spot' as string]: color }}
      {...rest}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: 'radial-gradient(420px circle at var(--mx) var(--my), rgb(var(--spot) / 0.12), transparent 45%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          padding: 1,
          background: 'radial-gradient(260px circle at var(--mx) var(--my), rgb(var(--spot) / 0.7), transparent 60%)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
