import express from 'express';
import pool from '../db.js';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();

router.use(requireAuth);

// 辅助：获取本地日期字符串（避免UTC偏移问题）
function getLocalDateString(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 校验目标成员是本人或同家庭成员（家长可查孩子）
function assertAccess(req, memberId) {
  return memberId === req.member.id || req.member.role === 'parent';
}

// 热力图数据：过去 N 天每日打卡次数和获得贴纸数
router.get('/heatmap/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { days = 90 } = req.query;

    if (!assertAccess(req, memberId)) {
      return res.status(403).json({ success: false, error: '无权查看该成员的数据' });
    }

    const numDays = Math.min(Math.max(parseInt(days) || 90, 7), 365);

    const result = await pool.query(`
      SELECT
        tc.completed_date as date,
        COUNT(DISTINCT tc.task_id) as task_count,
        COUNT(tc.id) as completion_count
      FROM task_completions tc
      WHERE tc.member_id = $1
        AND tc.completed_date >= CURRENT_DATE - ($2 || ' days')::interval
        AND tc.is_subsidy = false
      GROUP BY tc.completed_date
      ORDER BY tc.completed_date
    `, [memberId, numDays]);

    // 同时获取每日获得的贴纸数（用于热力图强度）
    const stickerResult = await pool.query(`
      SELECT
        DATE(created_at) as date,
        SUM(CASE WHEN change_type = 'earn' THEN sticker_change ELSE 0 END) as earned
      FROM sticker_logs
      WHERE member_id = $1
        AND created_at >= CURRENT_DATE - ($2 || ' days')::interval
      GROUP BY DATE(created_at)
    `, [memberId, numDays]);

    // 合并数据
    const stickerMap = {};
    stickerResult.rows.forEach(r => {
      stickerMap[r.date] = parseInt(r.earned) || 0;
    });

    const heatmap = result.rows.map(r => ({
      date: r.date,
      taskCount: parseInt(r.task_count) || 0,
      completionCount: parseInt(r.completion_count) || 0,
      earned: stickerMap[r.date] || 0
    }));

    // 计算统计信息
    const totalCompletions = heatmap.reduce((s, d) => s + d.completionCount, 0);
    const activeDays = heatmap.length;

    res.json({
      success: true,
      heatmap,
      summary: {
        totalDays: numDays,
        activeDays,
        totalCompletions,
        avgPerDay: activeDays > 0 ? (totalCompletions / activeDays).toFixed(1) : '0'
      }
    });
  } catch (error) {
    console.error('获取热力图数据失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 月度报告
router.get('/monthly-report/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { year, month } = req.query;

    if (!assertAccess(req, memberId)) {
      return res.status(403).json({ success: false, error: '无权查看该成员的数据' });
    }

    // 默认当月
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0); // 月末
    const startStr = getLocalDateString(startDate);
    const endStr = getLocalDateString(endDate);

    // 贴纸收支汇总
    const stickerSummary = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN change_type = 'earn' THEN sticker_change ELSE 0 END), 0) as earned,
        COALESCE(SUM(CASE WHEN change_type = 'penalty' THEN sticker_change ELSE 0 END), 0) as penalty,
        COALESCE(SUM(CASE WHEN change_type = 'subsidy' THEN sticker_change ELSE 0 END), 0) as subsidy,
        COALESCE(SUM(CASE WHEN change_type = 'adjust' THEN sticker_change ELSE 0 END), 0) as adjusted,
        COUNT(*) as log_count
      FROM sticker_logs
      WHERE member_id = $1
        AND created_at >= $2::date
        AND created_at < ($3::date + INTERVAL '1 day')
    `, [memberId, startStr, endStr]);

    // 粉球收支汇总
    const ballSummary = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN change_type = 'convert' THEN ball_change ELSE 0 END), 0) as converted,
        COALESCE(SUM(CASE WHEN change_type = 'use' THEN ball_change ELSE 0 END), 0) as used,
        COUNT(*) as log_count
      FROM ball_logs
      WHERE member_id = $1
        AND created_at >= $2::date
        AND created_at < ($3::date + INTERVAL '1 day')
    `, [memberId, startStr, endStr]);

    // 任务完成统计
    const taskStats = await pool.query(`
      SELECT
        COUNT(DISTINCT tc.task_id) as unique_tasks,
        COUNT(tc.id) as total_completions,
        COUNT(DISTINCT tc.completed_date) as active_days
      FROM task_completions tc
      WHERE tc.member_id = $1
        AND tc.completed_date >= $2::date
        AND tc.completed_date <= $3::date
        AND tc.is_subsidy = false
    `, [memberId, startStr, endStr]);

    // 任务分类完成情况
    const categoryStats = await pool.query(`
      SELECT
        t.category,
        COUNT(tc.id) as completions
      FROM task_completions tc
      JOIN tasks t ON tc.task_id = t.id
      WHERE tc.member_id = $1
        AND tc.completed_date >= $2::date
        AND tc.completed_date <= $3::date
        AND tc.is_subsidy = false
      GROUP BY t.category
      ORDER BY completions DESC
    `, [memberId, startStr, endStr]);

    // Top 任务排行
    const topTasks = await pool.query(`
      SELECT t.name, t.category, COUNT(tc.id) as completions
      FROM task_completions tc
      JOIN tasks t ON tc.task_id = t.id
      WHERE tc.member_id = $1
        AND tc.completed_date >= $2::date
        AND tc.completed_date <= $3::date
        AND tc.is_subsidy = false
      GROUP BY t.id, t.name, t.category
      ORDER BY completions DESC
      LIMIT 5
    `, [memberId, startStr, endStr]);

    // 抽卡统计
    const gachaStats = await pool.query(`
      SELECT
        COUNT(*) as total_pulls,
        COUNT(DISTINCT reward_id) as unique_rewards,
        SUM(CASE WHEN is_guaranteed THEN 1 ELSE 0 END) as guaranteed_count
      FROM gacha_records
      WHERE member_id = $1
        AND created_at >= $2::date
        AND created_at < ($3::date + INTERVAL '1 day')
    `, [memberId, startStr, endStr]);

    const earned = parseInt(stickerSummary.rows[0].earned) || 0;
    const penalty = parseInt(stickerSummary.rows[0].penalty) || 0;
    const subsidy = parseInt(stickerSummary.rows[0].subsidy) || 0;

    res.json({
      success: true,
      period: {
        year: targetYear,
        month: targetMonth,
        start: startStr,
        end: endStr
      },
      sticker: {
        earned,
        penalty,
        subsidy,
        adjusted: parseInt(stickerSummary.rows[0].adjusted) || 0,
        net: earned - penalty + subsidy,
        logCount: parseInt(stickerSummary.rows[0].log_count) || 0
      },
      ball: {
        converted: parseInt(ballSummary.rows[0].converted) || 0,
        used: Math.abs(parseInt(ballSummary.rows[0].used) || 0),
        logCount: parseInt(ballSummary.rows[0].log_count) || 0
      },
      tasks: {
        uniqueTasks: parseInt(taskStats.rows[0].unique_tasks) || 0,
        totalCompletions: parseInt(taskStats.rows[0].total_completions) || 0,
        activeDays: parseInt(taskStats.rows[0].active_days) || 0,
        categoryStats: categoryStats.rows.map(c => ({
          category: c.category,
          completions: parseInt(c.completions) || 0
        })),
        topTasks: topTasks.rows.map(t => ({
          name: t.name,
          category: t.category,
          completions: parseInt(t.completions) || 0
        }))
      },
      gacha: {
        totalPulls: parseInt(gachaStats.rows[0].total_pulls) || 0,
        uniqueRewards: parseInt(gachaStats.rows[0].unique_rewards) || 0,
        guaranteedCount: parseInt(gachaStats.rows[0].guaranteed_count) || 0
      }
    });
  } catch (error) {
    console.error('获取月度报告失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 月度趋势：过去 N 个月的贴纸净增
router.get('/trend/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const { months = 6 } = req.query;

    if (!assertAccess(req, memberId)) {
      return res.status(403).json({ success: false, error: '无权查看该成员的数据' });
    }

    const numMonths = Math.min(Math.max(parseInt(months) || 6, 1), 24);

    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        SUM(CASE WHEN change_type = 'earn' THEN sticker_change ELSE 0 END) as earned,
        SUM(CASE WHEN change_type = 'penalty' THEN sticker_change ELSE 0 END) as penalty,
        SUM(CASE WHEN change_type = 'subsidy' THEN sticker_change ELSE 0 END) as subsidy,
        COUNT(*) as log_count
      FROM sticker_logs
      WHERE member_id = $1
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE) - (($2 - 1) || ' months')::interval
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month
    `, [memberId, numMonths]);

    res.json({
      success: true,
      trend: result.rows.map(r => ({
        month: r.month,
        earned: parseInt(r.earned) || 0,
        penalty: parseInt(r.penalty) || 0,
        subsidy: parseInt(r.subsidy) || 0,
        net: (parseInt(r.earned) || 0) - (parseInt(r.penalty) || 0) + (parseInt(r.subsidy) || 0),
        logCount: parseInt(r.log_count) || 0
      }))
    });
  } catch (error) {
    console.error('获取趋势数据失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

export default router;
