/** D1 分片大小：单条查询最多 100 个绑定参数，IN 分句与 batch 分片都按 100 切。 */
export const D1_CHUNK = 100;

/** LIKE 通配符转义（\ % _），配套 ESCAPE '\' 的模式匹配。 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
