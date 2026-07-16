interface ThreadProps {
  className?: string;
  variant?: 'divider' | 'accent' | 'connector';
  color?: string;
}

export function Thread({ className, variant = 'divider', color }: ThreadProps) {
  if (variant === 'divider') {
    return <div className={`thread-divider ${className ?? ''}`} />;
  }

  const stroke = color ?? 'currentColor';

  if (variant === 'connector') {
    return (
      <svg
        className={className}
        width="2"
        height="100%"
        viewBox="0 0 2 100"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <path
          d="M1 0 C 0 25, 2 50, 1 75 S 0 100, 1 100"
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 120 24"
      fill="none"
      aria-hidden
      preserveAspectRatio="none"
    >
      <path d="M0 12 C 20 4, 40 20, 60 12 S 100 4, 120 12" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M0 16 C 20 10, 40 22, 60 16 S 100 10, 120 16" stroke={stroke} strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      <path d="M0 8 C 20 2, 40 14, 60 8 S 100 2, 120 8" stroke={stroke} strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
