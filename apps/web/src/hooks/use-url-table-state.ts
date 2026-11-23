'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Syncs DataTable query state (pagination, sorting, search, filters)
 * directly with URL search parameters so filtered views are bookmarkable
 * and survive page refreshes.
 */
export function useUrlTableState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getParam = useCallback(
    (key: string, fallback = '') => searchParams.get(key) ?? fallback,
    [searchParams],
  );

  const getNumberParam = useCallback(
    (key: string, fallback: number) => {
      const raw = searchParams.get(key);
      if (!raw) return fallback;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    },
    [searchParams],
  );

  const setParams = useCallback(
    (updates: Record<string, string | number | boolean | null | undefined>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === '') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      if (resetPage && !('page' in updates)) {
        next.set('page', '1');
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clearParams = useCallback(
    (keysToKeep: string[] = []) => {
      const next = new URLSearchParams();
      for (const k of keysToKeep) {
        const val = searchParams.get(k);
        if (val) next.set(k, val);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return {
    searchParams,
    getParam,
    getNumberParam,
    setParams,
    clearParams,
  };
}
