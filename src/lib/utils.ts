import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names.
 *
 * This is shadcn's canonical `cn`. It exists because `clsx` alone is not enough
 * for conditional classes: it concatenates, so a component's default `p-2` and a
 * caller's `p-4` both survive and the winner depends on stylesheet order rather
 * than on intent. `twMerge` resolves conflicting utilities by keeping the last,
 * which is what makes a caller able to override a component default.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
