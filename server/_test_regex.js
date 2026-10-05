const sql = "SELECT * FROM members WHERE id = 'abc' AND password = '123456'";
const whereMatch = sql.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
console.log('whereMatch:', whereMatch ? whereMatch[1] : 'NULL');

const sql2 = "SELECT * FROM members WHERE id = 'abc' ORDER BY name";
const whereMatch2 = sql2.match(/WHERE\s+(.+?)(?=\s+(?:GROUP|ORDER|LIMIT)|$)/i);
console.log('whereMatch2:', whereMatch2 ? whereMatch2[1] : 'NULL');
