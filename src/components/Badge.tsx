interface BadgeProps {
  variant?: 'confirmed' | 'pending' | 'available' | 'cancelled';
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = 'available', className, children }: BadgeProps) {
  const variantClass =
    variant === 'confirmed'
      ? 'badge-confirmed'
      : variant === 'pending'
      ? 'badge-pending'
      : variant === 'cancelled'
      ? 'badge-cancelled'
      : 'badge-available';

  return <span className={`${variantClass} ${className ?? ''}`}>{children}</span>;
}
