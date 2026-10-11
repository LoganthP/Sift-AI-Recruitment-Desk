import confetti from 'canvas-confetti';

export function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#34d3b4', '#8b7cf6', '#ff8a7a', '#f5c065'];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.7, x: 0.3 }, colors, scalar: 0.9 });
  setTimeout(() => confetti({ particleCount: 90, spread: 75, origin: { y: 0.7, x: 0.7 }, colors, scalar: 0.9 }), 180);
}
