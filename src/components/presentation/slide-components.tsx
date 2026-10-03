'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function SectionHeader({
  number,
  eyebrow,
  title,
  description,
  dark = false,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description?: string;
  dark?: boolean;
}) {
  return (
    <header className={`slide-heading${dark ? ' slide-heading-dark' : ''}`}>
      <span className="slide-heading-tab" aria-hidden="true" />
      <div>
        <p className="slide-eyebrow">{number} · {eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p className="slide-description">{description}</p> : null}
      </div>
    </header>
  );
}

export function NumberCard({
  number,
  title,
  children,
  inverted = false,
  className = '',
}: {
  number: string;
  title: string;
  children: ReactNode;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <article className={`number-card${inverted ? ' number-card-inverted' : ''} ${className}`}>
      <span className="number-card-number">{number}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

export function PillBadge({ children }: { children: ReactNode }) {
  return <span className="presentation-pill">{children}</span>;
}

export function Button({
  href,
  children,
  secondary = false,
  className = '',
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={`presentation-button${secondary ? ' presentation-button-secondary' : ''} ${className}`}>
      {children}
    </Link>
  );
}

export function SlideFooter({ number }: { number: string }) {
  return <p className="slide-footer">MediSense AI · {number}</p>;
}

export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  direction?: 'up' | 'left' | 'right';
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`slide-reveal slide-reveal-${direction}${visible ? ' is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function LineDraw({
  vertical = false,
  className = '',
}: {
  vertical?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      className={`line-draw${vertical ? ' line-draw-vertical' : ''}${visible ? ' is-visible' : ''} ${className}`}
      viewBox={vertical ? '0 0 10 100' : '0 0 100 10'}
      preserveAspectRatio="none"
    >
      <path d={vertical ? 'M5 0V100' : 'M0 5H100'} pathLength="1" />
      <circle r="2.2">
        <animateMotion
          dur="4s"
          repeatCount="indefinite"
          path={vertical ? 'M5 0V100' : 'M0 5H100'}
        />
      </circle>
    </svg>
  );
}
