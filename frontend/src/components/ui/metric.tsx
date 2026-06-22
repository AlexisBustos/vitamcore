import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

const toneColor: Record<NonNullable<MetricCardProps['tone']>, string> = {
  default: 'text-[var(--color-muted-foreground)]',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-warning)]',
  danger: 'text-[var(--color-danger)]',
};

export function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {title}
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-[var(--color-foreground)]">
            {value}
          </p>
          {hint && (
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              {hint}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)]">
            <Icon className={cn('h-5 w-5', toneColor[tone])} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
