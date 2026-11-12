import React, { useEffect, useRef } from 'react';

/**
 * EdithCore3D - 3D Holographic Stark Arc Reactor & Gyroscopic Quantum Core
 * Renders a rotating 3D crystalline cybernetic core with multi-axis orbital rings,
 * electric cyan photon flares, neon emerald energy pulses, and floating cyber stardust.
 */
export function EdithCore3D({ size = 130, isBusy = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let reducedMotion = Boolean(motionQuery?.matches);
    let animId = 0;
    let time = 0;

    const drawFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const radius = (width / 2) - 20;

      ctx.clearRect(0, 0, width, height);

      // 1. Ambient Volumetric Cyan/Emerald Diffuse Halo
      const ambientGlow = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius * 1.3);
      ambientGlow.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
      ambientGlow.addColorStop(0.5, 'rgba(16, 185, 129, 0.25)');
      ambientGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ambientGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // 2. Multi-Axis 3D Gyroscopic Orbital Rings
      const ringCount = 3;
      for (let r = 0; r < ringCount; r++) {
        ctx.save();
        ctx.translate(cx, cy);

        // Dynamic 3D tilt & rotation
        const ringAngle = time * (0.8 + r * 0.4) * (r % 2 === 0 ? 1 : -1);
        const tiltX = Math.cos(time * 0.5 + r) * 0.6 + 0.4;
        ctx.rotate(ringAngle);
        ctx.scale(1, tiltX);

        ctx.beginPath();
        const ringRadius = radius * (0.75 + r * 0.15);
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);

        ctx.strokeStyle = r === 0 
          ? 'rgba(34, 211, 238, 0.85)' // Electric Cyan
          : r === 1 
          ? 'rgba(52, 211, 153, 0.75)' // Neon Emerald
          : 'rgba(96, 165, 250, 0.65)'; // Cobalt Blue
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 8, 4, 8]);
        ctx.stroke();

        // Orbital photon node on each ring
        const nodeX = Math.cos(time * 2 + r * 2) * ringRadius;
        const nodeY = Math.sin(time * 2 + r * 2) * ringRadius;
        ctx.beginPath();
        ctx.arc(nodeX, nodeY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 12;
        ctx.fill();

        ctx.restore();
      }

      // 3. Central Crystalline Quantum Core (Facet Polyhedron)
      ctx.save();
      ctx.translate(cx, cy);

      const coreRadius = radius * 0.48;
      const vertices = 8;
      const corePoints = [];

      for (let i = 0; i < vertices; i++) {
        const theta = (i * Math.PI * 2) / vertices + time * 0.6;
        const rVar = coreRadius * (0.85 + 0.15 * Math.sin(time * 2 + i));
        corePoints.push({
          x: Math.cos(theta) * rVar,
          y: Math.sin(theta) * rVar
        });
      }

      // Draw faceted internal polygon
      ctx.beginPath();
      ctx.moveTo(corePoints[0].x, corePoints[0].y);
      for (let i = 1; i < vertices; i++) {
        ctx.lineTo(corePoints[i].x, corePoints[i].y);
      }
      ctx.closePath();

      // Core Gradient
      const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, coreRadius);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.35, 'rgba(34, 211, 238, 0.95)');
      coreGrad.addColorStop(0.7, 'rgba(16, 185, 129, 0.8)');
      coreGrad.addColorStop(1, 'rgba(7, 15, 30, 0.95)');
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Facet triangulation lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let i = 0; i < vertices; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(corePoints[i].x, corePoints[i].y);
        ctx.stroke();
      }

      ctx.restore();

      // 4. Floating Cyber Stardust Particles
      ctx.fillStyle = '#67e8f9';
      for (let p = 0; p < 16; p++) {
        const px = cx + Math.sin(p * 9 + time) * (radius * 0.9);
        const py = cy + Math.cos(p * 5 + time * 0.8) * (radius * 0.9);
        const pSize = (Math.sin(p + time * 2) + 1.2) * 0.7;
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Specular Concentric Energy Ring Pulse
      const pulsePhase = (time * 0.8) % 1;
      const pulseRadius = radius * (0.3 + pulsePhase * 0.7);
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.7 * (1 - pulsePhase)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const scheduleNext = () => {
      if (reducedMotion || (typeof document !== 'undefined' && document.hidden)) {
        return;
      }
      animId = requestAnimationFrame(() => {
        time += isBusy ? 0.04 : 0.018;
        drawFrame();
        scheduleNext();
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        drawFrame();
        scheduleNext();
      }
    };

    const handleMotionChange = (event) => {
      reducedMotion = event.matches;
      cancelAnimationFrame(animId);
      drawFrame();
      scheduleNext();
    };

    drawFrame();
    scheduleNext();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener('change', handleMotionChange);
    }

    return () => {
      cancelAnimationFrame(animId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener('change', handleMotionChange);
      }
    };
  }, [isBusy]);

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size + 32, height: size + 32 }}>
      {/* Outer ambient blur flare */}
      <div
        className="absolute rounded-full blur-2xl transition-all duration-700 pointer-events-none"
        style={{
          width: size,
          height: size,
          background: 'radial-gradient(circle, rgba(6,182,212,0.5) 0%, rgba(16,185,129,0.3) 50%, transparent 75%)',
          transform: isBusy ? 'scale(1.2)' : 'scale(1)'
        }}
      />
      <canvas
        ref={canvasRef}
        width={(size + 32) * 2}
        height={(size + 32) * 2}
        style={{ width: size + 32, height: size + 32 }}
        className="relative z-10 cursor-pointer drop-shadow-[0_0_25px_rgba(6,182,212,0.6)]"
      />
    </div>
  );
}

