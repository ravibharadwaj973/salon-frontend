import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes so later props win over base styles. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
