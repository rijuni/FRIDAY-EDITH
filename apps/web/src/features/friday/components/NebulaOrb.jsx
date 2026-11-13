import React, { useEffect, useRef, useState } from 'react';

/**
 * NebulaOrb - Realistic 3D Cosmic Plasma Orb
 * Renders an animated cosmic plasma sphere with swirling nebula gas, internal stars,
 * iridescent specular sheen, and an ambient outer glow halo.
 * Supports prefers-reduced-motion, hidden-tab pausing, and CSS fallback if 2D canvas fails.
 */
export function NebulaOrb({ isStreaming = false, size = 120 }) {
  const canvasRef = useRef(null);
  const [canvasUnavailable, setCanvasUnavailable] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) {
      setCanvasUnavailable(true);
      return;
    }

    const motionQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let reducedMotion = Boolean(motionQuery?.matches);

    let animationFrameId = null;
    let time = 0;

    const drawFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const radius = (width / 2) - 16;

      ctx.clearRect(0, 0, width, height);

      // 1. Outer Diffuse Glow Halo
      const outerGlow = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.3);
      outerGlow.addColorStop(0, 'rgba(236, 72, 153, 0.45)');
      outerGlow.addColorStop(0.5, 'rgba(139, 92, 246, 0.3)');
      outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // 2. Base Spherical Clip for Internal 3D Shading
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      const baseGrad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
      baseGrad.addColorStop(0, '#3b0764');
      baseGrad.addColorStop(0.6, '#1e1b4b');
      baseGrad.addColorStop(1, '#05020c');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Swirling Cosmic Plasma Clouds
      for (let i = 0; i < 4; i++) {
        const angle = time * (0.8 + i * 0.3) + (i * Math.PI) / 2;
        const dist = radius * (0.35 + 0.15 * Math.sin(time + i));
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;

        const plasmaGrad = ctx.createRadialGradient(px, py, 2, px, py, radius * 0.75);
        if (i % 3 === 0) {
          plasmaGrad.addColorStop(0, 'rgba(244, 114, 182, 0.85)');
          plasmaGrad.addColorStop(0.5, 'rgba(217, 70, 239, 0.4)');
          plasmaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else if (i % 3 === 1) {
          plasmaGrad.addColorStop(0, 'rgba(147, 51, 234, 0.8)');
          plasmaGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.35)');
          plasmaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          plasmaGrad.addColorStop(0, 'rgba(56, 189, 248, 0.75)');
          plasmaGrad.addColorStop(0.6, 'rgba(59, 130, 246, 0.3)');
          plasmaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }

        ctx.fillStyle = plasmaGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // 4. Stardust Micro-particles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for (let s = 0; s < 18; s++) {
        const sx = cx + Math.sin(s * 13 + time * 0.5) * (radius * 0.75);
        const sy = cy + Math.cos(s * 7 + time * 0.7) * (radius * 0.75);
        const pSize = (Math.sin(s + time * 2) + 1.2) * 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, pSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. 3D Specular Spherical Rim Lighting
      const rimGrad = ctx.createRadialGradient(cx, cy, radius * 0.82, cx, cy, radius);
      rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      rimGrad.addColorStop(0.8, 'rgba(244, 114, 182, 0.6)');
      rimGrad.addColorStop(1, 'rgba(168, 85, 247, 0.9)');
      ctx.fillStyle = rimGrad;
      ctx.fillRect(0, 0, width, height);

      // 6. Top-left Specular Glass Reflection Highlight
      const highlight = ctx.createRadialGradient(
        cx - radius * 0.38,
        cy - radius * 0.38,
        2,
        cx - radius * 0.38,
        cy - radius * 0.38,
        radius * 0.45
      );
      highlight.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      highlight.addColorStop(0.3, 'rgba(244, 114, 182, 0.4)');
      highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, width, height);

      ctx.restore();
    };

    const renderLoop = () => {
      animationFrameId = null;
      if (reducedMotion || document.visibilityState === 'hidden') return;
      time += isStreaming ? 0.04 : 0.015;
      drawFrame();
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    const stopLoop = () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    };

    const startLoop = () => {
      if (!reducedMotion && document.visibilityState !== 'hidden' && animationFrameId === null) {
        animationFrameId = requestAnimationFrame(renderLoop);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopLoop();
      } else {
        drawFrame();
        startLoop();
      }
    };

    const handleMotionChange = (event) => {
      reducedMotion = event.matches;
      stopLoop();
      drawFrame();
      startLoop();
    };

    drawFrame();
    startLoop();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    motionQuery?.addEventListener?.('change', handleMotionChange);

    return () => {
      stopLoop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      motionQuery?.removeEventListener?.('change', handleMotionChange);
    };
  }, [isStreaming]);

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size + 32, height: size + 32 }}>
      {/* Outer ambient blur shadow */}
      <div
        className="absolute rounded-full blur-2xl transition-all duration-700 pointer-events-none"
        style={{
          width: size,
          height: size,
          background: isStreaming
            ? 'radial-gradient(circle, rgba(236,72,153,0.6) 0%, rgba(139,92,246,0.5) 50%, transparent 70%)'
            : 'radial-gradient(circle, rgba(236,72,153,0.4) 0%, rgba(139,92,246,0.3) 50%, transparent 70%)',
          transform: isStreaming ? 'scale(1.2)' : 'scale(1)'
        }}
      />
      {canvasUnavailable ? (
        <div
          aria-label="F.R.I.D.A.Y. Nebula Orb"
          className="relative z-10 rounded-full border border-purple-400/40 shadow-[0_0_25px_rgba(236,72,153,0.5)]"
          style={{
            width: size,
            height: size,
            background: 'radial-gradient(circle at 30% 30%, rgba(244,114,182,0.85), rgba(109,40,217,0.9) 55%, #090418 100%)'
          }}
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={(size + 32) * 2}
          height={(size + 32) * 2}
          style={{ width: size + 32, height: size + 32 }}
          className="relative z-10 cursor-pointer drop-shadow-[0_0_20px_rgba(236,72,153,0.5)]"
        />
      )}
    </div>
  );
}

