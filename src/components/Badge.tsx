interface BadgeProps {
  variant?: 'confirmed' | 'pending' | 'available';
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = 'available', className, children }: BadgeProps) {
  const variantClass =
    variant === 'confirmed'
      ? 'badge-confirmed'
      : variant === 'pending'
      ? 'badge-pending'
      : 'badge-available';

  return <span className={`${variantClass} ${className ?? ''}`}>{children}</span>;
}
