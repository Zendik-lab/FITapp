const stopWords = new Set(['в', 'с', 'со', 'и', 'из', 'на', 'для', 'по', 'к']);
const synonymGroups = [
  ['куриц', 'курин'],
  ['мяс', 'говядин', 'свинин', 'баранин', 'телятин'],
  ['овсян', 'геркулес'],
  ['макарон', 'паст', 'спагетти', 'пенне', 'рожки'],
  ['картоф', 'картош'],
  ['творог', 'творож'],
  ['банан'],
  ['молок', 'молоч'],
  ['масса', 'массы', 'набор'],
  ['белков', 'высокобелк', 'протеин'],
  ['коктейл', 'смузи', 'шейк'],
  ['помидор', 'томат'],
  ['гречк', 'гречнев'],
  ['перец', 'перцем', 'перца'],
  ['лук', 'луком', 'репчат'],
] as const;

export function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchTerms(value: string): string[] {
  return [
    ...new Set(
      normalizeSearch(value)
        .split(' ')
        .filter((word) => word && !stopWords.has(word)),
    ),
  ];
}

function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) return oneEdit(b, a);
  let first = 0;
  while (first < a.length && a[first] === b[first]) first += 1;
  if (a.length < b.length) return a.slice(first) === b.slice(first + 1);
  return (
    a.slice(first + 1) === b.slice(first + 1) ||
    (a[first] === b[first + 1] &&
      a[first + 1] === b[first] &&
      a.slice(first + 2) === b.slice(first + 2))
  );
}

function prefixes(word: string) {
  return synonymGroups.find((group) =>
    group.some((prefix) => word.startsWith(prefix)),
  );
}

const cheeseForm = /^(?:сыр(?:а|у|ом|е|ы|ов|ам|ами|ах)?|сырн\p{L}+)$/u;

export function wordScore(term: string, words: readonly string[]): number {
  if (words.includes(term)) return 5;
  if (cheeseForm.test(term))
    return words.some((word) => cheeseForm.test(word)) ? 2 : 0;
  if (words.some((word) => word.startsWith(term))) return 4;
  if (term.length >= 4 && words.some((word) => word.includes(term))) return 3;
  const synonyms = prefixes(term);
  if (
    synonyms &&
    words.some((word) => synonyms.some((prefix) => word.startsWith(prefix)))
  )
    return 2;
  if (term.length >= 5 && words.some((word) => oneEdit(term, word))) return 1;
  return 0;
}
