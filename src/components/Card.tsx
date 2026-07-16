import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  selected?: boolean;
  hover?: boolean;
}

export function Card({ interactive, selected, hover, className, children, ...props }: CardProps) {
  const base = interactive ? 'card-interactive' : hover ? 'card-hover' : 'card';
  return (
    <div className={`${base} ${selected ? 'card-selected' : ''} ${className ?? ''}`} {...props}>
      {children}
    </div>
  );
}
