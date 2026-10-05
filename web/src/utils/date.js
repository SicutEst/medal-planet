// 本地日期工具：显式使用浏览器本地时区的日期字符串（YYYY-MM-DD），
// 避免使用 toISOString() 时 UTC 时区导致的日期错位
export function localDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
