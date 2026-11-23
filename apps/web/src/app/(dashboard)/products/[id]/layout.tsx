import type { ReactNode } from 'react';

export function generateStaticParams() {
  return [
    { id: 'default' },
    ...Array.from({ length: 24 }, (_, idx) => ({
      id: `prd-demo-${String(idx + 1).padStart(4, '0')}`,
    })),
  ];
}

export default function ProductDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
