import { useState, ImgHTMLAttributes } from 'react';

interface SmartImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  aspect?: string;
  rounded?: string;
}

export function SmartImage({
  aspect = 'aspect-[4/3]',
  rounded = 'rounded-2xl',
  className,
  src,
  alt,
  ...props
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden ${aspect} ${rounded} ${className ?? ''}`}>
      {!loaded && <div className="absolute inset-0 img-placeholder" />}
      {src && (
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-700 ease-silk ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          {...props}
        />
      )}
    </div>
  );
}
