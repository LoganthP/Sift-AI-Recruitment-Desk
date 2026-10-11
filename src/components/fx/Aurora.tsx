export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[10vw] -top-[20vh] h-[60vh] w-[55vw] rounded-full bg-violet/45 blur-[110px]" style={{ animation: 'drift 24s ease-in-out infinite' }} />
      <div className="absolute -bottom-[25vh] -right-[10vw] h-[60vh] w-[50vw] rounded-full bg-teal/30 blur-[110px]" style={{ animation: 'drift 30s ease-in-out infinite reverse' }} />
      <div className="absolute left-[40vw] top-[45vh] h-[30vh] w-[28vw] rounded-full bg-coral/15 blur-[100px]" style={{ animation: 'drift 36s ease-in-out infinite' }} />
      <div className="grid-bg absolute inset-0" />
    </div>
  );
}
