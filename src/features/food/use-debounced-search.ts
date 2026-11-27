import { useEffect, useState } from 'react';

export function useDebouncedSearch(query: string) {
  const [search, setSearch] = useState(query);
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(() => setSearch(query), 160);
    return () => clearTimeout(timer);
  }, [query]);
  return query ? search : '';
}
