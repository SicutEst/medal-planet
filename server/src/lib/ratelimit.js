// 轻量内存限流：按 keyFn 生成的键在时间窗口内限制请求次数
// 单实例部署足够；键数量超阈值时惰性清理过期项防膨胀
const buckets = new Map();

export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, keyFn = req => req.ip } = {}) {
  return (req, res, next) => {
    let key;
    try {
      key = keyFn(req) || 'unknown';
    } catch {
      key = 'unknown';
    }
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (now > v.resetAt) buckets.delete(k);
      }
    }
    if (entry.count > max) {
      return res.status(429).json({ success: false, error: '操作过于频繁，请稍后再试' });
    }
    next();
  };
}
