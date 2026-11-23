import type { ReactNode } from 'react';

export function generateStaticParams() {
  return [
    { id: 'default' },
    ...Array.from({ length: 20 }, (_, idx) => ({
      id: `ord-demo-${String(idx + 1).padStart(4, '0')}`,
    })),
  ];
}

export default function OrderDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
