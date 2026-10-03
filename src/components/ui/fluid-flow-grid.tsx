'use client';

import { useEffect, useRef, useState } from 'react';

export default function FluidFlowGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(mediaQuery.matches);
    const handler = (event: MediaQueryListEvent) => setIsDarkMode(event.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handleMouseMove = (event: MouseEvent) => {
      mouse.targetX = event.clientX;
      mouse.targetY = event.clientY;
    };

    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    let time = 0;

    const render = () => {
      time += 0.008;

      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      const bgColor = isDarkMode ? '#255941' : '#F2EBDC';
      const lineBaseColor = '109, 140, 117';
      const accentTeal = '45, 115, 75';

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      const spacing = 35;
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      ctx.lineWidth = 1.2;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;

          let angle = Math.sin(x * 0.003 + time) + Math.cos(y * 0.003 + time);

          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let isNear = false;
          if (dist < 220 && dist > 0) {
            isNear = true;
            const pushAngle = Math.atan2(dy, dx) + Math.PI;
            const force = 1 - dist / 220;
            angle = angle * (1 - force) + pushAngle * force;
          }

          const lineLen = isNear ? 22 : 14;
          const x2 = x + Math.cos(angle) * lineLen;
          const y2 = y + Math.sin(angle) * lineLen;

          const alpha = isNear
            ? 0.8
            : 0.15 + Math.sin(x * 0.01 + y * 0.01 + time) * 0.1;

          ctx.strokeStyle = isNear
            ? `rgba(${accentTeal}, ${alpha})`
            : `rgba(${lineBaseColor}, ${alpha})`;

          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isDarkMode]);

  return (
    <div className="relative h-screen w-full select-none overflow-hidden bg-slate-950">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 block cursor-default"
      />

      <div className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-center px-4 text-center text-brand-900">
        <span className="mb-3 font-mono text-xs uppercase tracking-widest text-brand-600">
          {/* FLUID_VECTOR_STREAM */}
        </span>
        <h1 className="font-mono text-6xl font-black uppercase leading-none tracking-tighter md:text-9xl">
          CURRENT
        </h1>
        <p className="mt-4 max-w-lg font-mono text-xs opacity-70 md:text-sm">
          Smooth directional flow field rendered in calm, neutral teal tones.
        </p>
      </div>
    </div>
  );
}
