/** 5 级蓝色色阶；L0 用主题空底色（CSS 变量，随深浅主题变化）。 */
export const LEVEL_COLORS = [
  "var(--dsw-alias-bg-skeleton)",
  "#C9DDF9",
  "#8FB9F0",
  "#5E8FE8",
  "#396BE2",
] as const;

export type Level = 0 | 1 | 2 | 3 | 4;

/**
 * 按非零日数值的四分位把单日总量映射到 1..4 档（0 为 L0）。
 * 分位边界值归入较高档；数据无差异（q25 === q75）时非零值统一归 3 档。
 */
export function levelsFor(values: number[]): (value: number) => Level {
  const nonZero = values.filter((v) => v > 0).sort((a, b) => a - b);
  const n = nonZero.length;
  if (n === 0) return () => 0;
  const at = (p: number) => nonZero[Math.min(n - 1, Math.floor(p * (n - 1)))];
  const q25 = at(0.25);
  const q50 = at(0.5);
  const q75 = at(0.75);
  if (q25 === q75) return (value) => (value > 0 ? 3 : 0);
  return (value) => {
    if (value <= 0) return 0;
    if (value >= q75) return 4;
    if (value >= q50) return 3;
    if (value >= q25) return 2;
    return 1;
  };
}
