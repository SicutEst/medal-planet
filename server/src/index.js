import express from 'express';
import cors from 'cors';
import pool from './db.js';
import { initDatabase } from './models/init.js';
import familyRoutes from './routes/family.js';
import memberRoutes from './routes/member.js';
import taskRoutes from './routes/task.js';
import applicationRoutes from './routes/application.js';
import stickerRoutes from './routes/sticker.js';
import rewardRoutes from './routes/reward.js';
import gachaRoutes from './routes/gacha.js';
import statsRoutes from './routes/stats.js';

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// 生产环境强制使用自定义 JWT 密钥
const JWT_SECRET = process.env.JWT_SECRET || '';
if (isProduction && (!JWT_SECRET || /change|secret|example|please/i.test(JWT_SECRET))) {
  console.error('❌ 生产环境必须通过 .env 设置强度足够的 JWT_SECRET 后才能启动');
  console.error('   生成方式：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

// 中间件：生产环境走 nginx 同源反代，无需 CORS；开发模式允许跨域
if (!isProduction) {
  app.use(cors());
}
app.set('trust proxy', 1);
app.use(express.json());

// 路由
app.use('/api/family', familyRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/application', applicationRoutes);
app.use('/api/sticker', stickerRoutes);
app.use('/api/reward', rewardRoutes);
app.use('/api/gacha', gachaRoutes);
app.use('/api/stats', statsRoutes);

// 健康检查
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'connected' });
  } catch (e) {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'disconnected' });
  }
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
async function start() {
  try {
    // 初始化数据库
    await initDatabase();
    console.log('✅ 数据库连接成功');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎪 奖章星球后端已启动`);
      console.log(`📡 访问地址: http://localhost:${PORT}`);
      console.log(`🔗 API地址: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

start();
