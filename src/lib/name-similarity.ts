/**
 * Deterministic Name Similarity Percentage Calculator (0 - 100%)
 * Compares two names and calculates an authoritative similarity percentage based on
 * token overlap and character n-gram (Sorensen-Dice) matching.
 */
export function calculateNameSimilarity(
  name1: string | null | undefined,
  name2: string | null | undefined
): number {
  if (!name1 || !name2) return 0;

  const clean1 = name1.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
  const clean2 = name2.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');

  if (!clean1 || !clean2) return 0;
  if (clean1 === clean2) return 100;

  const tokens1 = clean1.split(' ');
  const tokens2 = clean2.split(' ');

  // 1. Token exact & prefix overlap
  let tokenMatches = 0;
  tokens1.forEach((t1) => {
    if (tokens2.some((t2) => t2 === t1 || (t1.length >= 3 && t2.startsWith(t1)) || (t2.length >= 3 && t1.startsWith(t2)))) {
      tokenMatches++;
    }
  });

  const tokenRatio = (2 * tokenMatches) / (tokens1.length + tokens2.length);

  // 2. Character bigram Sorensen-Dice similarity
  const getBigrams = (str: string) => {
    const s = ` ${str} `;
    const bg: string[] = [];
    for (let i = 0; i < s.length - 1; i++) {
      bg.push(s.slice(i, i + 2));
    }
    return bg;
  };

  const bg1 = getBigrams(clean1);
  const bg2 = getBigrams(clean2);

  let bgMatches = 0;
  const copy2 = [...bg2];
  bg1.forEach((b1) => {
    const idx = copy2.indexOf(b1);
    if (idx !== -1) {
      bgMatches++;
      copy2.splice(idx, 1);
    }
  });

  const diceRatio = (2 * bgMatches) / (bg1.length + bg2.length);

  // Combine metrics for maximum precision
  const compositeScore = Math.max(diceRatio, tokenRatio);
  const percentage = Math.round(compositeScore * 100);

  return Math.min(100, Math.max(0, percentage));
}
