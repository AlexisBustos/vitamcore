import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}

/** Envoltorio label + control + error para formularios. */
export function Field({
  label,
  htmlFor,
  required,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1.5 block">
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </Label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}
