import { v4 as uuidv4 } from 'uuid';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'db.json');

function uuid() {
  return uuidv4();
}

function nowIso() {
  return new Date().toISOString();
}

function dateOnly(d) {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class MemoryDb {
  constructor() {
    this.tables = {
      families: [],
      members: [],
      tasks: [],
      task_completions: [],
      applications: [],
      sticker_logs: [],
      ball_logs: [],
      rewards: [],
      reward_exchanges: [],
      gacha_records: [],
      achievements: [],
      pet_collections: [],
    };
    this._locks = new Map();
    this._saveTimer = null;
    this._dirty = false;
  }

  // === 文件持久化 ===
  loadFromDisk() {
    try {
      if (!existsSync(DATA_FILE)) return false;
      const raw = readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        for (const key of Object.keys(this.tables)) {
          if (Array.isArray(data[key])) {
            this.tables[key] = data[key];
          }
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error('⚠️  加载数据文件失败，将使用种子数据:', e.message);
      return false;
    }
  }

  saveToDisk() {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = JSON.stringify(this.tables, null, 2);
      writeFileSync(DATA_FILE, data, 'utf-8');
      return true;
    } catch (e) {
      console.error('⚠️  保存数据文件失败:', e.message);
      return false;
    }
  }

  // 防抖保存：100ms 内多次写入只触发一次磁盘 IO
  _scheduleSave() {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (this._dirty) {
        this.saveToDisk();
        this._dirty = false;
      }
    }, 100);
  }

  async query(sql, params = []) {
    const result = this._execute(sql, params);
    // 写操作触发持久化
    const trimmed = sql.trim().toUpperCase();
    if (
      trimmed.startsWith('INSERT') ||
      trimmed.startsWith('UPDATE') ||
      trimmed.startsWith('DELETE')
    ) {
      this._scheduleSave();
    }
    return { rows: result, rowCount: result.length };
  }

  async connect() {
    const client = {
      query: async (sql, params) => this.query(sql, params),
      release: () => {},
    };
    return client;
  }

  _execute(sql, params) {
    const trimmed = sql.trim();

    if (/^SELECT\s/i.test(trimmed)) {
      return this._execSelect(trimmed, params);
    }
    if (/^INSERT\s/i.test(trimmed)) {
      return this._execInsert(trimmed, params);
    }
    if (/^UPDATE\s/i.test(trimmed)) {
      return this._execUpdate(trimmed, params);
    }
    if (/^DELETE\s/i.test(trimmed)) {
      return this._execDelete(trimmed, params);
    }
    if (/^CREATE\s/i.test(trimmed) || /^ALTER\s/i.test(trimmed) || /^CREATE INDEX\s/i.test(trimmed)) {
      return [];
    }
    if (/^BEGIN/i.test(trimmed) || /^COMMIT/i.test(trimmed) || /^ROLLBACK/i.test(trimmed)) {
      return [];
    }
    return [];
  }

  _param(sql, params) {
    let i = 0;
    return sql.replace(/\$(\d+)/g, (_, n) => {
      const idx = parseInt(n) - 1;
      const v = params[idx];
      if (typeof v === 'string') {
        return `'${v.replace(/'/g, "''")}'`;
      }
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return String(v);
    });
  }

  _getTopLevelSql(sql) {
    let depth = 0;
    let inStr = false;
    let result = '';
    let placeholderIdx = 0;
    for (let i = 0; i < sql.length; i++) {
      const c = sql[i];
      if (c === "'") {
        inStr = !inStr;
        if (depth === 0) result += c;
        continue;
      }
      if (inStr) {
        if (depth === 0) result += c;
        continue;
      }
      if (c === '(') {
        if (depth === 0) {
          result += `__SUB${placeholderIdx}__`;
          placeholderIdx++;
        }
        depth++;
        continue;
      }
      if (c === ')') {
        depth--;
        continue;
      }
      if (depth === 0) {
        result += c;
      }
    }
    return result;
  }

  _execSelect(sql, params) {
    const filled = this._param(sql, params);
    const topSql = this._getTopLevelSql(filled).replace(/\s+/g, ' ').trim();

    const fromMatch = topSql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return [];
    const tableName = fromMatch[1];
    let table = this.tables[tableName] || [];

    const joinMatches = [...topSql.matchAll(/JOIN\s+(\w+)\s+(?:\w+\s+)?ON\s+(.+?)(?=\s+(?:WHERE|GROUP|ORDER|LIMIT|JOIN|$))/gi)];
    const joins = joinMatches.map(m => ({
      table: m[1],
      on: m[2].trim()
    }));

    const whereMatch = topSql.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
    const whereClause = whereMatch ? this._restoreSubquery(whereMatch[1].trim(), filled) : null;

    const groupMatch = topSql.match(/GROUP\s+BY\s+(.+?)(?=\s+(?:ORDER|LIMIT|$))/i);
    const groupBy = groupMatch ? groupMatch[1].trim().split(/\s*,\s*/) : null;

    const orderMatch = topSql.match(/ORDER\s+BY\s+(.+?)(?=\s+(?:LIMIT|$))/i);
    const orderBy = orderMatch ? orderMatch[1].trim() : null;

    const limitMatch = topSql.match(/LIMIT\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : null;

    let rows = [...table];

    for (const join of joins) {
      const joinTable = this.tables[join.table] || [];
      const newRows = [];
      for (const row of rows) {
        for (const jrow of joinTable) {
          const combined = { ...row, ...jrow };
          if (this._evalCondition(join.on, combined)) {
            newRows.push(combined);
          }
        }
        if (joinTable.length === 0) {
          newRows.push({ ...row });
        }
      }
      rows = newRows;
    }

    if (whereClause) {
      rows = rows.filter(row => this._evalCondition(whereClause, row));
    }

    if (groupBy) {
      rows = this._applyGroupBy(rows, groupBy, filled);
    }

    const selectMatch = topSql.match(/SELECT\s+(.+?)\s+FROM\s/i);
    if (selectMatch) {
      const selectStr = this._restoreSubquery(selectMatch[1].trim(), filled);
      if (selectStr !== '*' && !groupBy) {
        rows = this._projectColumns(rows, selectStr);
      }
      if (selectStr.includes('COUNT(DISTINCT') && groupBy) {
      }
    }

    if (orderBy) {
      rows = this._applyOrderBy(rows, orderBy);
    }

    if (limit !== null) {
      rows = rows.slice(0, limit);
    }

    return rows;
  }

  _restoreSubquery(text, original) {
    return text.replace(/__SUB(\d+)__/g, (_, idx) => {
      const num = parseInt(idx);
      let depth = 0;
      let inStr = false;
      let count = -1;
      for (let i = 0; i < original.length; i++) {
        const c = original[i];
        if (c === "'") inStr = !inStr;
        if (!inStr) {
          if (c === '(') {
            if (depth === 0) count++;
            depth++;
            if (count === num) {
              let end = i + 1;
              let d = 1;
              let s = false;
              while (end < original.length && d > 0) {
                const cc = original[end];
                if (cc === "'") s = !s;
                if (!s) {
                  if (cc === '(') d++;
                  if (cc === ')') d--;
                }
                end++;
              }
              return original.substring(i, end);
            }
          }
          if (c === ')') depth--;
        }
      }
      return '';
    });
  }

  _projectColumns(rows, selectStr) {
    const cols = this._splitSelectColumns(selectStr);
    const hasStar = cols.some(c => c.trim().endsWith('*'));
    return rows.map(row => {
      const newRow = hasStar ? { ...row } : {};
      for (const col of cols) {
        const trimmed = col.trim();
        if (!trimmed) continue;
        if (trimmed === '*') continue;
        if (trimmed.endsWith('.*')) continue;
        const isSubquery = trimmed.startsWith('(') && trimmed.includes('SELECT');
        const asMatch = trimmed.match(/\s+AS\s+(\w+)$/i);
        if (asMatch) {
          const alias = asMatch[1];
          const expr = trimmed.substring(0, asMatch.index).trim();
          if (isSubquery) {
            newRow[alias] = 0;
          } else {
            newRow[alias] = this._safeEvalExpr(expr, row);
          }
        } else {
          if (isSubquery) continue;
          const val = this._safeEvalExpr(trimmed, row);
          const colName = trimmed.includes('.') && !trimmed.includes('(') ? trimmed.split('.')[1] : trimmed;
          newRow[colName] = val;
        }
      }
      return newRow;
    });
  }

  _splitSelectColumns(selectStr) {
    const parts = [];
    let depth = 0;
    let current = '';
    let inStr = false;
    for (let i = 0; i < selectStr.length; i++) {
      const c = selectStr[i];
      if (c === "'") inStr = !inStr;
      if (!inStr) {
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (depth === 0 && c === ',') {
          parts.push(current);
          current = '';
          continue;
        }
      }
      current += c;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  _safeEvalExpr(expr, row) {
    try {
      if (expr.startsWith('(') && expr.endsWith(')')) {
        return 0;
      }
      return this._evalExpr(expr, row);
    } catch (e) {
      return null;
    }
  }

  _evalExpr(expr, row) {
    expr = expr.trim();
    if (expr === '*') return row;

    const countMatch = expr.match(/^COUNT\((.+)\)$/i);
    if (countMatch) {
      if (countMatch[1].toUpperCase().startsWith('DISTINCT')) {
        const col = countMatch[1].replace(/DISTINCT\s+/i, '').trim();
        const values = new Set();
        if (Array.isArray(row)) {
          for (const r of row) values.add(r[col]);
        } else {
          values.add(row[col]);
        }
        return values.size;
      }
      if (countMatch[1] === '*') {
        return Array.isArray(row) ? row.length : 1;
      }
    }

    const sumMatch = expr.match(/^SUM\((.+)\)$/i);
    if (sumMatch) {
      const inner = sumMatch[1];
      if (inner.includes('CASE')) {
        return Array.isArray(row) ? row.reduce((s, r) => s + (parseFloat(this._evalCase(inner, r)) || 0), 0) : (parseFloat(this._evalCase(inner, row)) || 0);
      }
      return Array.isArray(row) ? row.reduce((s, r) => s + (parseFloat(r[inner]) || 0), 0) : (parseFloat(row[inner]) || 0);
    }

    const coalesceMatch = expr.match(/^COALESCE\((.+),\s*(.+)\)$/i);
    if (coalesceMatch) {
      const val = this._evalExpr(coalesceMatch[1], row);
      return val !== null && val !== undefined ? val : this._evalExpr(coalesceMatch[2], row);
    }

    const dateFuncMatch = expr.match(/^DATE\((.+)\)$/i);
    if (dateFuncMatch) {
      const val = this._evalExpr(dateFuncMatch[1], row);
      if (!val) return null;
      return dateOnly(val);
    }

    const toCharMatch = expr.match(/^TO_CHAR\((.+?),\s*'(.+?)'\)$/i);
    if (toCharMatch) {
      const val = this._evalExpr(toCharMatch[1], row);
      if (!val) return null;
      const d = new Date(val);
      const fmt = toCharMatch[2];
      if (fmt === 'YYYY-MM') {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      }
      return val;
    }

    const dateTruncMatch = expr.match(/^DATE_TRUNC\('month',\s*(.+?)\)$/i);
    if (dateTruncMatch) {
      const val = this._evalExpr(dateTruncMatch[1], row);
      if (!val) return null;
      const d = new Date(val);
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    }

    if (expr.includes('.')) {
      const [t, c] = expr.split('.');
      return row[c] ?? row[expr];
    }

    return row[expr];
  }

  _evalCase(expr, row) {
    const caseMatch = expr.match(/CASE\s+(.+?)\s+ELSE\s+(\d+)\s+END/i);
    if (!caseMatch) return 0;
    const body = caseMatch[1];
    const elseVal = parseInt(caseMatch[2]) || 0;
    
    const whenMatch = body.match(/WHEN\s+(.+?)\s+THEN\s+(\d+)/i);
    if (whenMatch) {
      const condition = whenMatch[1];
      const thenVal = parseInt(whenMatch[2]) || 0;
      if (this._evalCondition(condition, row)) return thenVal;
    }
    return elseVal;
  }

  _evalCondition(cond, row) {
    if (!cond) return true;

    const andParts = this._splitBy(cond, 'AND');
    if (andParts.length > 1) {
      return andParts.every(p => this._evalCondition(p.trim(), row));
    }

    const orParts = this._splitBy(cond, 'OR');
    if (orParts.length > 1) {
      return orParts.some(p => this._evalCondition(p.trim(), row));
    }

    const inMatch = cond.match(/^(.+?)\s+IN\s+\((.+)\)$/i);
    if (inMatch) {
      const left = inMatch[1].trim();
      const val = this._getVal(left, row);
      const vals = inMatch[2].split(/\s*,\s*/).map(v => v.trim().replace(/^'|'$/g, ''));
      return vals.includes(String(val));
    }

    const notInMatch = cond.match(/^(.+?)\s+NOT\s+IN\s+\((.+)\)$/i);
    if (notInMatch) {
      const left = notInMatch[1].trim();
      const val = this._getVal(left, row);
      const vals = notInMatch[2].split(/\s*,\s*/).map(v => v.trim().replace(/^'|'$/g, ''));
      return !vals.includes(String(val));
    }

    const likeMatch = cond.match(/^(.+?)\s+LIKE\s+(.+)$/i);
    if (likeMatch) {
      const left = likeMatch[1].trim();
      const val = String(this._getVal(left, row) || '');
      let pattern = likeMatch[2].trim().replace(/^'|'$/g, '');
      pattern = pattern.replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp(`^${pattern}$`, 'i').test(val);
    }

    const betweenMatch = cond.match(/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
    if (betweenMatch) {
      const left = parseFloat(this._getVal(betweenMatch[1].trim(), row)) || 0;
      const low = parseFloat(this._getVal(betweenMatch[2].trim(), row)) || 0;
      const high = parseFloat(this._getVal(betweenMatch[3].trim(), row)) || 0;
      return left >= low && left <= high;
    }

    const eqMatch = cond.match(/^(.+?)\s*=\s*(.+)$/);
    if (eqMatch) {
      const left = this._getVal(eqMatch[1].trim(), row);
      const right = this._getVal(eqMatch[2].trim(), row);
      return left == right;
    }

    const neMatch = cond.match(/^(.+?)\s*(!=|<>)\s*(.+)$/);
    if (neMatch) {
      const left = this._getVal(neMatch[1].trim(), row);
      const right = this._getVal(neMatch[3].trim(), row);
      return left != right;
    }

    const gtMatch = cond.match(/^(.+?)\s*>\s*(.+)$/);
    if (gtMatch) {
      const left = parseFloat(this._getVal(gtMatch[1].trim(), row)) || 0;
      const right = parseFloat(this._getVal(gtMatch[2].trim(), row)) || 0;
      return left > right;
    }

    const gteMatch = cond.match(/^(.+?)\s*>=\s*(.+)$/);
    if (gteMatch) {
      const left = parseFloat(this._getVal(gteMatch[1].trim(), row)) || 0;
      const right = parseFloat(this._getVal(gteMatch[2].trim(), row)) || 0;
      return left >= right;
    }

    const ltMatch = cond.match(/^(.+?)\s*<\s*(.+)$/);
    if (ltMatch) {
      const left = parseFloat(this._getVal(ltMatch[1].trim(), row)) || 0;
      const right = parseFloat(this._getVal(ltMatch[2].trim(), row)) || 0;
      return left < right;
    }

    const lteMatch = cond.match(/^(.+?)\s*<=\s*(.+)$/);
    if (lteMatch) {
      const left = parseFloat(this._getVal(lteMatch[1].trim(), row)) || 0;
      const right = parseFloat(this._getVal(lteMatch[2].trim(), row)) || 0;
      return left <= right;
    }

    const isNullMatch = cond.match(/^(.+?)\s+IS\s+NULL$/i);
    if (isNullMatch) {
      const val = this._getVal(isNullMatch[1].trim(), row);
      return val === null || val === undefined;
    }

    const isNotNullMatch = cond.match(/^(.+?)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      const val = this._getVal(isNotNullMatch[1].trim(), row);
      return val !== null && val !== undefined;
    }

    return true;
  }

  _splitBy(str, op) {
    const parts = [];
    let depth = 0;
    let current = '';
    let inStr = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === "'") inStr = !inStr;
      if (!inStr) {
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (depth === 0 && str.substr(i, op.length).toUpperCase() === op &&
            (i === 0 || str[i-1] === ' ' || str[i-1] === ')') &&
            (i + op.length === str.length || str[i+op.length] === ' ' || str[i+op.length] === '(')) {
          parts.push(current);
          current = '';
          i += op.length - 1;
          continue;
        }
      }
      current += c;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  _getVal(expr, row) {
    expr = expr.trim();
    if (expr === "''") return '';
    if (expr === 'NULL') return null;
    if (expr.toUpperCase() === 'TRUE') return true;
    if (expr.toUpperCase() === 'FALSE') return false;
    const numMatch = expr.match(/^-?\d+(\.\d+)?$/);
    if (numMatch) return parseFloat(expr);
    const strMatch = expr.match(/^'(.*)'$/);
    if (strMatch) return strMatch[1];
    if (expr.includes('::')) {
      const base = expr.split('::')[0];
      return this._getVal(base, row);
    }
    if (expr.includes('.')) {
      const [t, c] = expr.split('.');
      return row[c] ?? row[expr];
    }
    return row[expr];
  }

  _applyGroupBy(rows, groupCols, sql) {
    const groups = new Map();
    for (const row of rows) {
      const key = groupCols.map(c => {
        if (c.includes('DATE_TRUNC')) {
          const match = c.match(/DATE_TRUNC\('month',\s*(.+?)\)/i);
          if (match) {
            const col = match[1].includes('.') ? match[1].split('.')[1] : match[1];
            const d = new Date(row[col]);
            return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
          }
        }
        if (c.includes('DATE(')) {
          const match = c.match(/DATE\((.+?)\)/i);
          if (match) {
            const col = match[1].includes('.') ? match[1].split('.')[1] : match[1];
            return dateOnly(row[col]);
          }
        }
        if (c.includes('.')) {
          const [t, col] = c.split('.');
          return row[col];
        }
        return row[c];
      }).join('|');

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const result = [];
    for (const [key, groupRows] of groups) {
      const newRow = {};
      const keyVals = key.split('|');
      for (let i = 0; i < groupCols.length; i++) {
        let colName = groupCols[i];
        if (colName.includes(' AS ')) {
          const m = colName.match(/(.+?)\s+AS\s+(\w+)/i);
          colName = m ? m[2] : colName;
        }
        if (colName.includes('DATE_TRUNC')) {
          const aliasMatch = groupCols[i].match(/AS\s+(\w+)/i);
          const alias = aliasMatch ? aliasMatch[1] : 'month';
          newRow[alias] = keyVals[i];
        } else if (colName.includes('DATE(')) {
          const aliasMatch = groupCols[i].match(/AS\s+(\w+)/i);
          const alias = aliasMatch ? aliasMatch[1] : 'date';
          newRow[alias] = keyVals[i];
        } else if (colName.includes('.')) {
          const [t, c] = colName.split('.');
          newRow[c] = keyVals[i];
        } else {
          newRow[colName] = keyVals[i];
        }
      }

      const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s/i);
      if (selectMatch) {
        const selectStr = selectMatch[1];
        const aggregates = selectStr.split(/\s*,\s*/);
        for (const agg of aggregates) {
          const trimmed = agg.trim();
          const countDistinctMatch = trimmed.match(/COUNT\(DISTINCT\s+(.+?)\)\s*(?:AS\s+(\w+))?/i);
          if (countDistinctMatch) {
            const col = countDistinctMatch[1].includes('.') ? countDistinctMatch[1].split('.')[1] : countDistinctMatch[1];
            const alias = countDistinctMatch[2] || 'count';
            const unique = new Set(groupRows.map(r => r[col]));
            newRow[alias] = unique.size;
            continue;
          }
          const countMatch = trimmed.match(/COUNT\(\*\)\s*(?:AS\s+(\w+))?/i);
          if (countMatch) {
            const alias = countMatch[1] || 'count';
            newRow[alias] = groupRows.length;
            continue;
          }
          const sumMatch = trimmed.match(/SUM\((.+?)\)\s*(?:AS\s+(\w+))?/i);
          if (sumMatch) {
            const inner = sumMatch[1];
            const alias = sumMatch[2] || 'sum';
            let total = 0;
            if (inner.includes('CASE')) {
              for (const r of groupRows) {
                total += parseFloat(this._evalCase(inner, r)) || 0;
              }
            } else {
              const col = inner.includes('.') ? inner.split('.')[1] : inner;
              for (const r of groupRows) {
                total += parseFloat(r[col]) || 0;
              }
            }
            newRow[alias] = total;
            continue;
          }
          const coalesceMatch = trimmed.match(/COALESCE\((.+),\s*(.+)\)\s*(?:AS\s+(\w+))?/i);
          if (coalesceMatch) {
            const alias = coalesceMatch[3] || 'coalesce';
            const inner = coalesceMatch[1];
            let total = 0;
            if (inner.includes('SUM')) {
              const sumInner = inner.match(/SUM\((.+)\)/i)[1];
              if (sumInner.includes('CASE')) {
                for (const r of groupRows) {
                  total += parseFloat(this._evalCase(sumInner, r)) || 0;
                }
              }
            }
            newRow[alias] = total;
            continue;
          }
        }
      }
      result.push(newRow);
    }
    return result;
  }

  _applyOrderBy(rows, orderBy) {
    const items = orderBy.split(/\s*,\s*/);
    return rows.sort((a, b) => {
      for (const item of items) {
        const parts = item.trim().split(/\s+/);
        let col = parts[0];
        const dir = parts[1]?.toUpperCase() === 'DESC' ? -1 : 1;
        if (col.includes('.')) col = col.split('.')[1];

        let va = a[col];
        let vb = b[col];

        if (col.includes('CASE')) {
          va = this._evalCase(col, a);
          vb = this._evalCase(col, b);
        }

        if (va === null || va === undefined) va = '';
        if (vb === null || vb === undefined) vb = '';

        if (typeof va === 'number' && typeof vb === 'number') {
          if (va !== vb) return (va - vb) * dir;
        } else {
          const cmp = String(va).localeCompare(String(vb));
          if (cmp !== 0) return cmp * dir;
        }
      }
      return 0;
    });
  }

  _execInsert(sql, params) {
    const filled = this._param(sql, params);
    const tableMatch = filled.match(/INSERT\s+INTO\s+(\w+)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)/i);
    if (!tableMatch) return [];

    const tableName = tableMatch[1];
    const cols = tableMatch[2].split(/\s*,\s*/).map(c => c.trim());
    const vals = this._splitValues(tableMatch[3]);

    const row = {};
    row.id = uuid();
    row.created_at = nowIso();

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const rawVal = vals[i]?.trim();
      let val;
      if (rawVal === "''" || rawVal === '') val = '';
      else if (rawVal === 'NULL') val = null;
      else if (rawVal === 'TRUE') val = true;
      else if (rawVal === 'FALSE') val = false;
      else if (/^-?\d+(\.\d+)?$/.test(rawVal)) val = parseFloat(rawVal);
      else if (rawVal?.startsWith("'") && rawVal?.endsWith("'")) val = rawVal.slice(1, -1);
      else if (rawVal?.toUpperCase() === 'CURRENT_TIMESTAMP') val = nowIso();
      else val = rawVal;
      row[col] = val;
    }

    if (!this.tables[tableName]) this.tables[tableName] = [];
    this.tables[tableName].push(row);

    const returningMatch = filled.match(/RETURNING\s+(.+?)(?:\s|$)/i);
    if (returningMatch) {
      return [row];
    }
    return [];
  }

  _splitValues(str) {
    const parts = [];
    let current = '';
    let inStr = false;
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === "'") inStr = !inStr;
      if (!inStr) {
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === ',' && depth === 0) {
          parts.push(current);
          current = '';
          continue;
        }
      }
      current += c;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  _execUpdate(sql, params) {
    const filled = this._param(sql, params);
    const tableMatch = filled.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+?))?(?:\s+RETURNING\s+.+)?$/i);
    if (!tableMatch) return [];

    const tableName = tableMatch[1];
    const setStr = tableMatch[2];
    const whereStr = tableMatch[3] || null;
    const table = this.tables[tableName] || [];

    const setPairs = this._splitSetClauses(setStr);
    const updated = [];

    for (const row of table) {
      if (!whereStr || this._evalCondition(whereStr, row)) {
        for (const [col, valExpr] of setPairs) {
          if (valExpr.includes('+') || valExpr.includes('-') || valExpr.includes('*') || valExpr.includes('/')) {
            row[col] = this._evalArithmetic(valExpr, row);
          } else if (valExpr === 'CURRENT_TIMESTAMP') {
            row[col] = nowIso();
          } else if (valExpr === 'NULL') {
            row[col] = null;
          } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
            row[col] = valExpr.slice(1, -1);
          } else if (/^-?\d+(\.\d+)?$/.test(valExpr)) {
            row[col] = parseFloat(valExpr);
          } else {
            row[col] = valExpr;
          }
        }
        row.updated_at = nowIso();
        updated.push(row);
      }
    }

    const returningMatch = filled.match(/RETURNING\s+\*/i);
    if (returningMatch) return updated;
    return updated;
  }

  _splitSetClauses(str) {
    const pairs = [];
    let current = '';
    let depth = 0;
    let inStr = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === "'") inStr = !inStr;
      if (!inStr) {
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === ',' && depth === 0) {
          pairs.push(current.trim());
          current = '';
          continue;
        }
      }
      current += c;
    }
    if (current.trim()) pairs.push(current.trim());
    return pairs.map(p => {
      const eqIdx = p.indexOf('=');
      return [p.slice(0, eqIdx).trim(), p.slice(eqIdx + 1).trim()];
    });
  }

  _evalArithmetic(expr, row) {
    const addMatch = expr.match(/^(.+?)\s*\+\s*(.+)$/);
    if (addMatch) {
      return (parseFloat(this._getVal(addMatch[1], row)) || 0) + (parseFloat(this._getVal(addMatch[2], row)) || 0);
    }
    const subMatch = expr.match(/^(.+?)\s*-\s*(.+)$/);
    if (subMatch) {
      return (parseFloat(this._getVal(subMatch[1], row)) || 0) - (parseFloat(this._getVal(subMatch[2], row)) || 0);
    }
    return parseFloat(expr) || 0;
  }

  _execDelete(sql, params) {
    const filled = this._param(sql, params);
    const tableMatch = filled.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!tableMatch) return [];

    const tableName = tableMatch[1];
    const whereStr = tableMatch[2] || null;
    const table = this.tables[tableName] || [];

    if (!whereStr) {
      this.tables[tableName] = [];
    } else {
      this.tables[tableName] = table.filter(row => !this._evalCondition(whereStr, row));
    }
    return [];
  }

  async begin() { this._inTx = true; }
  async commit() { this._inTx = false; }
  async rollback() { this._inTx = false; }
}

const db = new MemoryDb();

const pool = {
  query: async (sql, params) => db.query(sql, params),
  connect: async () => db.connect(),
  _db: db,
};

export function seedDatabase() {
  const db = pool._db;

  // 优先从磁盘加载数据，文件存在则不使用种子数据
  if (db.loadFromDisk()) {
    console.log(`📂 已从磁盘加载数据: ${DATA_FILE}`);
    const familyCount = db.tables.families.length;
    const memberCount = db.tables.members.length;
    const taskCount = db.tables.tasks.length;
    console.log(`   家庭: ${familyCount} 个 | 成员: ${memberCount} 个 | 任务: ${taskCount} 条`);
    if (familyCount > 0) {
      const fc = db.tables.families[0].family_code;
      console.log(`   示例家庭码: ${fc}`);
    }
    return;
  }

  console.log('🌱 首次启动，初始化种子数据...');

  const familyId = uuid();
  const parentId = uuid();
  const childId = uuid();

  db.tables.families.push({
    id: familyId,
    family_code: 'ABC1234',
    name: '幸福家庭',
    created_at: nowIso(),
  });

  db.tables.members.push({
    id: parentId,
    family_id: familyId,
    name: '爸爸',
    role: 'parent',
    current_stickers: 0,
    total_stickers: 0,
    current_balls: 0,
    total_balls: 0,
    password: '123456',
    gacha_pity_counter: 0,
    avatar: '👨',
    created_at: nowIso(),
  });

  db.tables.members.push({
    id: childId,
    family_id: familyId,
    name: '小明',
    role: 'child',
    current_stickers: 120,
    total_stickers: 480,
    current_balls: 3,
    total_balls: 3,
    password: '123456',
    gacha_pity_counter: 5,
    avatar: '👦',
    created_at: nowIso(),
  });

  const habitTasks = [
    { name: '早起刷牙', sticker_reward: 5, repeat_rule: 'daily' },
    { name: '按时完成作业', sticker_reward: 10, repeat_rule: 'daily' },
    { name: '阅读30分钟', sticker_reward: 8, repeat_rule: 'daily' },
    { name: '整理房间', sticker_reward: 15, repeat_rule: 'weekly' },
  ];

  const badHabitTasks = [
    { name: '看电视超过1小时', sticker_reward: 10 },
    { name: '不按时睡觉', sticker_reward: 5 },
    { name: '挑食不吃饭', sticker_reward: 8 },
  ];

  const tempTasks = [
    { name: '帮妈妈买菜', sticker_reward: 20, valid_days: 7 },
    { name: '完成手工制作', sticker_reward: 15, valid_days: 0 },
  ];

  for (const t of habitTasks) {
    db.tables.tasks.push({
      id: uuid(),
      family_id: familyId,
      name: t.name,
      description: '',
      category: 'habit',
      repeat_rule: t.repeat_rule,
      custom_days: null,
      target_count: 1,
      accumulative_mode: 'pass_or_fail',
      valid_days: null,
      sticker_reward: t.sticker_reward,
      is_active: true,
      created_by: parentId,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  for (const t of badHabitTasks) {
    db.tables.tasks.push({
      id: uuid(),
      family_id: familyId,
      name: t.name,
      description: '',
      category: 'bad_habit',
      repeat_rule: 'daily',
      custom_days: null,
      target_count: 1,
      accumulative_mode: 'pass_or_fail',
      valid_days: null,
      sticker_reward: t.sticker_reward,
      is_active: true,
      created_by: parentId,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  for (const t of tempTasks) {
    db.tables.tasks.push({
      id: uuid(),
      family_id: familyId,
      name: t.name,
      description: '',
      category: 'temporary',
      repeat_rule: 'daily',
      custom_days: null,
      target_count: 1,
      accumulative_mode: 'pass_or_fail',
      valid_days: t.valid_days,
      sticker_reward: t.sticker_reward,
      is_active: true,
      created_by: parentId,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  const rewards = [
    { name: '小贴纸包', tier: '普通', required_balls: 10, is_gacha: true, is_exchange: true, icon: '📦' },
    { name: '文具套装', tier: '三星', required_balls: 30, is_gacha: true, is_exchange: true, icon: '✏️' },
    { name: '漫画书一本', tier: '四星', required_balls: 60, is_gacha: true, is_exchange: true, icon: '📚' },
    { name: '乐高玩具', tier: '五星', required_balls: 100, is_gacha: true, is_exchange: true, icon: '🧱' },
    { name: '冰淇淋', tier: '三星', required_balls: 20, is_gacha: false, is_exchange: true, icon: '🍦' },
    { name: '看电影', tier: '四星', required_balls: 80, is_gacha: false, is_exchange: true, icon: '🎬' },
  ];

  for (const r of rewards) {
    db.tables.rewards.push({
      id: uuid(),
      family_id: familyId,
      name: r.name,
      description: '',
      tier: r.tier,
      required_balls: r.required_balls,
      is_gacha_pool: r.is_gacha,
      is_exchangeable: r.is_exchange,
      is_claimed: false,
      claimed_by: null,
      claimed_at: null,
      stock: -1,
      icon: r.icon,
      sort_order: 0,
      created_at: nowIso(),
    });
  }

  const today = dateOnly(new Date());
  const yesterday = dateOnly(new Date(Date.now() - 86400000));
  const d3 = dateOnly(new Date(Date.now() - 2 * 86400000));
  const d7 = dateOnly(new Date(Date.now() - 6 * 86400000));

  const taskIds = db.tables.tasks.filter(t => t.category === 'habit').map(t => t.id);
  const dates = [today, yesterday, d3, d7];
  for (let i = 0; i < 20; i++) {
    const taskId = taskIds[i % taskIds.length];
    const date = dates[i % dates.length];
    db.tables.task_completions.push({
      id: uuid(),
      task_id: taskId,
      member_id: childId,
      completed_date: date,
      count_today: 1,
      is_subsidy: false,
      subsidy_date: null,
      created_at: nowIso(),
    });
  }

  for (let i = 0; i < 15; i++) {
    const date = dates[i % dates.length];
    const isEarn = i < 12;
    db.tables.sticker_logs.push({
      id: uuid(),
      member_id: childId,
      task_id: taskIds[i % taskIds.length],
      application_id: null,
      change_type: isEarn ? 'earn' : 'penalty',
      sticker_change: isEarn ? 10 : 5,
      balance_after: 50 + i * 5,
      remark: '',
      subsidy_date: null,
      created_by: parentId,
      created_at: new Date(new Date(date).getTime() + 3600000 * i).toISOString(),
    });
  }

  console.log('🌱 种子数据已初始化');
  console.log(`   家庭码: ABC1234`);
  console.log(`   家长账号: 爸爸 / 123456`);
  console.log(`   孩子账号: 小明 / 123456`);
  // 种子数据立即保存到磁盘
  db.saveToDisk();
  console.log(`💾 数据已保存到: ${DATA_FILE}`);
}

export default pool;
