import type { ReactNode } from 'react';
import { formatAddressLines } from './addressFormat';

interface AddressBlockProps {
  name?: string | null;
  address?: string | null;
  province?: string | null;
  country?: string | null;
  className?: string;
  nameClassName?: string;
  lineClassName?: string;
  emptyFallback?: ReactNode;
}

export default function AddressBlock({
  name,
  address,
  province,
  country,
  className = '',
  nameClassName = 'text-base font-bold text-gray-900 leading-tight',
  lineClassName = 'text-sm text-gray-500 leading-6',
  emptyFallback = null,
}: AddressBlockProps) {
  const lines = formatAddressLines({ address, province, country });
  const hasName = Boolean(name?.trim());

  return (
    <div className={className}>
      {hasName && <p className={nameClassName}>{name}</p>}
      {lines.length > 0 ? (
        <div className={hasName ? 'mt-1.5 space-y-0.5' : 'space-y-0.5'}>
          {lines.map((line, index) => (
            <p key={`${line}-${index}`} className={lineClassName}>
              {line}
            </p>
          ))}
        </div>
      ) : (
        emptyFallback
      )}
    </div>
  );
}
