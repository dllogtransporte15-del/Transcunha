import React, { useEffect } from 'react';

const INTERACTIVE_SURFACE_SELECTOR = '.interactive-spotlight, .card-brand, .glass-panel';

/**
 * Lightweight 60fps cursor-tracking spotlight layer.
 * Updates CSS custom properties (--cursor-x, --cursor-y) on hovered surfaces
 * without triggering React re-renders. Automatically disabled on touch devices
 * and when prefers-reduced-motion is enabled.
 */
const InteractiveCursorLayer: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (isCoarsePointer || prefersReducedMotion) return;

    let rafId: number | null = null;
    let activeSurface: HTMLElement | null = null;
    let lastX = 0;
    let lastY = 0;

    const updateSurfaceCoords = () => {
      rafId = null;
      if (!activeSurface) return;
      const rect = activeSurface.getBoundingClientRect();
      const x = lastX - rect.left;
      const y = lastY - rect.top;
      activeSurface.style.setProperty('--cursor-x', `${x}px`);
      activeSurface.style.setProperty('--cursor-y', `${y}px`);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const target = e.target as HTMLElement | null;
      const surface = target?.closest?.(INTERACTIVE_SURFACE_SELECTOR) as HTMLElement | null;

      if (activeSurface && activeSurface !== surface) {
        activeSurface.removeAttribute('data-spotlight-active');
      }

      activeSurface = surface;
      if (!activeSurface) return;

      activeSurface.setAttribute('data-spotlight-active', 'true');
      lastX = e.clientX;
      lastY = e.clientY;

      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateSurfaceCoords);
      }
    };

    const handlePointerLeaveWindow = () => {
      if (activeSurface) {
        activeSurface.removeAttribute('data-spotlight-active');
        activeSurface = null;
      }
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', handlePointerLeaveWindow, { passive: true });

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', handlePointerLeaveWindow);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (activeSurface) activeSurface.removeAttribute('data-spotlight-active');
    };
  }, []);

  return null;
};

export default InteractiveCursorLayer;
