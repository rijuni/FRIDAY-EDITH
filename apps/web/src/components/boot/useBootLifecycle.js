import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Shared accessible boot animation lifecycle with single-shot completion guard,
 * reduced-motion immediate completion, and cleanup on unmount.
 */
export function useBootLifecycle({
  onComplete,
  stage1Ms = 550,
  stage2Ms = 1300,
  durationMs = 3200
}) {
  const [stage, setStage] = useState(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const completeBoot = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    try {
      onCompleteRef.current?.();
    } catch {
      // Guard against animation/callback errors stalling navigation
    }
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      const immediateTimer = setTimeout(completeBoot, 0);
      return () => clearTimeout(immediateTimer);
    }

    const t1 = setTimeout(() => setStage(1), stage1Ms);
    const t2 = setTimeout(() => setStage(2), stage2Ms);
    const t3 = setTimeout(completeBoot, durationMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [prefersReducedMotion, stage1Ms, stage2Ms, durationMs, completeBoot]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        completeBoot();
      }
    },
    [completeBoot]
  );

  return { stage, prefersReducedMotion, completeBoot, handleKeyDown };
}

