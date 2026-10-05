import express from 'express';
import pool from '../db.js';
import { requireAuth, requireParent } from '../lib/auth.js';
import { applyStickerChange, deductStickers } from '../lib/economy.js';

const router = express.Router();

router.use(requireAuth);

// 获取本地日期字符串（YYYY-MM-DD），避免 toISOString() 返回 UTC 日期导致的时区偏差
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 校验任务属于当前用户家庭，通过返回任务行
async function getFamilyTask(req, taskId) {
  const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (result.rows.length === 0) return { error: '任务不存在', code: 404 };
  if (result.rows[0].family_id !== req.member.family_id) return { error: '无权操作该任务', code: 403 };
  return { task: result.rows[0] };
}

// 获取任务列表
router.get('/family/:familyId', async (req, res) => {
  try {
    const familyId = req.member.family_id;
    const { category } = req.query;

    let query = `
      SELECT t.*, m.name as created_by_name
      FROM tasks t
      LEFT JOIN members m ON t.created_by = m.id
      WHERE t.family_id = $1 AND t.is_active = true
    `;
    const params = [familyId];

    if (category) {
      query += ` AND t.category = $2`;
      params.push(category);
    }

    query += ` ORDER BY t.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, tasks: result.rows });
  } catch (error) {
    console.error('获取任务失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取今日任务
router.get('/family/:familyId/today', async (req, res) => {
  try {
    const familyId = req.member.family_id;
    const memberId = req.member.id;
    const { date } = req.query;

    const targetDate = date || getLocalDateString();
    const target = new Date(targetDate);
    const dayOfWeek = target.getDay(); // 0=周日, 6=周六
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 获取所有习惯任务（含坏习惯），completed_count 为当日累计次数（无记录为 NULL）
    const tasksResult = await pool.query(`
      SELECT t.*,
        (SELECT tc.count_today FROM task_completions tc
         WHERE tc.task_id = t.id AND tc.member_id = $2 AND tc.completed_date = $3 AND tc.is_subsidy = false LIMIT 1) as completed_count,
        (SELECT tc.count_today FROM task_completions tc
         WHERE tc.task_id = t.id AND tc.member_id = $2 AND tc.completed_date = $3 AND tc.is_subsidy = false LIMIT 1) as is_completed_today
      FROM tasks t
      WHERE t.family_id = $1 AND t.is_active = true AND t.category IN ('habit', 'bad_habit')
      ORDER BY t.created_at
    `, [familyId, memberId, targetDate]);

    // 过滤今日应显示的任务
    const todayTasks = tasksResult.rows.filter(task => {
      const repeatRule = task.repeat_rule;
      switch (repeatRule) {
        case 'daily':
          return true; // 每天
        case 'weekly':
          // 每周：与任务创建日同星期几
          return dayOfWeek === new Date(task.created_at).getDay();
        case 'monthly':
          // 每月：与创建日的"日"号相同，31 号创建的任务在小月按月末处理
          const taskDay = new Date(task.created_at).getDate();
          const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
          return target.getDate() === Math.min(taskDay, lastDayOfMonth);
        default:
          // custom: 检查是否在有效期内
          if (task.repeat_rule === 'custom' && task.custom_days) {
            const created = new Date(task.created_at);
            const endDate = new Date(created);
            endDate.setDate(endDate.getDate() + task.custom_days);
            return target <= endDate;
          }
          return false;
      }
    });

    // 获取临时任务（按有效期过滤）
    // valid_days: NULL/0/负数 = 仅限当天；>0 = N天内有效
    // 同时限制 targetDate 不能早于 created_at（任务创建前的日期不显示）
    const tempTasksResult = await pool.query(`
      SELECT t.*,
        (SELECT tc.count_today FROM task_completions tc
         WHERE tc.task_id = t.id AND tc.member_id = $2 AND tc.completed_date = $3 AND tc.is_subsidy = false LIMIT 1) as completed_count,
        (SELECT tc.count_today FROM task_completions tc
         WHERE tc.task_id = t.id AND tc.member_id = $2 AND tc.completed_date = $3 AND tc.is_subsidy = false LIMIT 1) as is_completed_today
      FROM tasks t
      WHERE t.family_id = $1 AND t.is_active = true AND t.category = 'temporary'
        AND t.created_at::date <= $3::date
        AND (
          CASE
            WHEN COALESCE(t.valid_days, 0) <= 0 THEN t.created_at::date = $3::date
            ELSE t.created_at::date + (t.valid_days || ' days')::interval >= $3::date
          END
        )
      ORDER BY t.created_at DESC
    `, [familyId, memberId, targetDate]);

    // 合并结果
    const allTasks = [...todayTasks.map(t => ({ ...t, is_today: true })),
                      ...tempTasksResult.rows.map(t => ({ ...t, is_today: true }))];

    res.json({
      success: true,
      date: targetDate,
      isWeekend,
      tasks: allTasks
    });
  } catch (error) {
    console.error('获取今日任务失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 获取本周/本月进度（用于周期打卡）
router.get('/family/:familyId/progress', async (req, res) => {
  try {
    const familyId = req.member.family_id;
    const memberId = req.member.id;
    const { period, taskId } = req.query;

    const targetDate = new Date();
    let startDate, endDate, periodType;

    if (period === 'week') {
      periodType = 'week';
      startDate = getWeekStart(targetDate);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
    } else if (period === 'month') {
      periodType = 'month';
      startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    } else {
      return res.status(400).json({ success: false, error: '无效的周期' });
    }

    // repeat_rule 存的是 weekly/monthly，period 是 week/month
    const repeatRule = period === 'week' ? 'weekly' : 'monthly';
    const params = [familyId, memberId, startDate, endDate, repeatRule];
    let taskFilter = '';
    if (taskId) {
      taskFilter = `AND t.id = $6`;
      params.push(taskId);
    }

    const result = await pool.query(`
      SELECT t.id, t.name, t.target_count, t.accumulative_mode,
        COUNT(tc.id) as completed_count
      FROM tasks t
      LEFT JOIN task_completions tc ON t.id = tc.task_id
        AND tc.member_id = $2
        AND tc.completed_date >= $3::date
        AND tc.completed_date <= $4::date
        AND tc.is_subsidy = false
      WHERE t.family_id = $1 AND t.is_active = true AND t.category = 'habit'
        AND t.repeat_rule = $5
        ${taskFilter}
      GROUP BY t.id, t.name, t.target_count, t.accumulative_mode
    `, params);

    res.json({
      success: true,
      period: periodType,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      progress: result.rows
    });
  } catch (error) {
    console.error('获取进度失败:', error);
    res.status(500).json({ success: false, error: '获取失败' });
  }
});

// 批量创建任务（从模板）
router.post('/batch', requireParent, async (req, res) => {
  try {
    const familyId = req.member.family_id;
    const createdBy = req.member.id;
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, error: '任务列表不能为空' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const createdTasks = [];
      for (const task of tasks) {
        // 坏习惯任务强制为简单模式
        const isBadHabit = task.category === 'bad_habit';
        // 保留 validDays=0（仅限当天），仅当未提供时存 null；负数视为0
        const validDaysValue = isBadHabit ? null
          : ((task.validDays === undefined || task.validDays === null) ? null : Math.max(0, task.validDays));
        const result = await client.query(
          `INSERT INTO tasks (family_id, name, description, category, repeat_rule, custom_days, target_count, accumulative_mode, valid_days, sticker_reward, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [familyId, task.name, task.description || '', task.category, task.repeatRule || 'daily',
           task.customDays || null, isBadHabit ? 1 : (task.targetCount || 1), isBadHabit ? 'pass_or_fail' : (task.accumulativeMode || 'pass_or_fail'),
           validDaysValue, task.stickerReward || 1, createdBy]
        );
        createdTasks.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.json({ success: true, tasks: createdTasks });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('批量创建任务失败:', error);
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// 创建任务
router.post('/', requireParent, async (req, res) => {
  try {
    const familyId = req.member.family_id;
    const createdBy = req.member.id;
    let {
      name, description, category, repeatRule, customDays,
      targetCount, accumulativeMode, validDays, stickerReward
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return res.status(400).json({ success: false, error: '任务名称需为 1-100 个字符' });
    }

    // 坏习惯任务强制为简单模式：每次扣固定贴纸，不支持定量/累计
    if (category === 'bad_habit') {
      targetCount = 1;
      accumulativeMode = 'pass_or_fail';
      validDays = null;
    }

    // 保留 validDays=0（仅限当天），仅当未提供时存 null；负数视为0
    const validDaysValue = (validDays === undefined || validDays === null) ? null : Math.max(0, validDays);

    const result = await pool.query(
      `INSERT INTO tasks (family_id, name, description, category, repeat_rule, custom_days, target_count, accumulative_mode, valid_days, sticker_reward, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [familyId, name.trim(), description || '', category || 'habit', repeatRule || 'daily',
       customDays || null, targetCount || 1, accumulativeMode || 'pass_or_fail',
       validDaysValue, stickerReward || 1, createdBy]
    );

    res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    console.error('创建任务失败:', error);
    res.status(500).json({ success: false, error: '创建失败' });
  }
});

// 更新任务
router.put('/:id', requireParent, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await getFamilyTask(req, id);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }

    const { name, description, repeatRule, customDays, targetCount, accumulativeMode, validDays, stickerReward, isActive } = req.body;

    const result = await pool.query(
      `UPDATE tasks SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        repeat_rule = COALESCE($3, repeat_rule),
        custom_days = COALESCE($4, custom_days),
        target_count = COALESCE($5, target_count),
        accumulative_mode = COALESCE($6, accumulative_mode),
        valid_days = COALESCE($7, valid_days),
        sticker_reward = COALESCE($8, sticker_reward),
        is_active = COALESCE($9, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [name, description, repeatRule, customDays, targetCount, accumulativeMode, validDays, stickerReward, isActive, id]
    );

    res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    console.error('更新任务失败:', error);
    res.status(500).json({ success: false, error: '更新失败' });
  }
});

// 删除任务
router.delete('/:id', requireParent, async (req, res) => {
  try {
    const { id } = req.params;
    const check = await getFamilyTask(req, id);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('删除任务失败:', error);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

// 完成任务（打卡）
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const memberId = req.member.id;
    const { date, count = 1, isSubsidy = false, subsidyDate = null } = req.body;
    const targetDate = date || getLocalDateString();

    // 获取任务信息
    const check = await getFamilyTask(req, id);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }
    const task = check.task;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 更新或插入完成记录
      let countToday;
      if (task.target_count > 1) {
        // 定量任务：当日累计计数（达标型与累计型都累加）
        const existing = await client.query(
          'SELECT * FROM task_completions WHERE task_id = $1 AND member_id = $2 AND completed_date = $3',
          [id, memberId, targetDate]
        );

        if (existing.rows.length > 0) {
          countToday = existing.rows[0].count_today + count;
          await client.query(
            'UPDATE task_completions SET count_today = $1 WHERE id = $2',
            [countToday, existing.rows[0].id]
          );
        } else {
          countToday = count;
          await client.query(
            'INSERT INTO task_completions (task_id, member_id, completed_date, count_today, is_subsidy, subsidy_date) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, memberId, targetDate, count, isSubsidy, subsidyDate]
          );
        }
      } else {
        // 普通任务：每天一次
        const existing = await client.query(
          'SELECT id FROM task_completions WHERE task_id = $1 AND member_id = $2 AND completed_date = $3',
          [id, memberId, targetDate]
        );

        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '今日已完成该任务' });
        }

        countToday = 1;
        await client.query(
          'INSERT INTO task_completions (task_id, member_id, completed_date, count_today, is_subsidy, subsidy_date) VALUES ($1, $2, $3, 1, $4, $5)',
          [id, memberId, targetDate, isSubsidy, subsidyDate]
        );
      }

      // 贴纸发放语义：打卡只记录完成，贴纸统一经「提交申请 → 家长审批」发放（方案A）。
      // 唯一例外是坏习惯：即时扣除贴纸，不经过审批。
      let deductionResult = null;
      if (task.category === 'bad_habit') {
        deductionResult = await deductStickers(client, {
          memberId, amount: task.sticker_reward, taskId: task.id, createdBy: memberId,
        });
      }

      await client.query('COMMIT');

      // 坏习惯扣贴纸：返回实际扣除信息（余额不足时实际扣除数可能小于请求扣除数）
      if (task.category === 'bad_habit' && deductionResult) {
        const message = deductionResult.actualDeduction < deductionResult.requestedAmount
          ? `打卡成功（贴纸余额不足，实际扣除 ${deductionResult.actualDeduction} 个）`
          : '打卡成功';
        res.json({
          success: true,
          message,
          actualDeduction: deductionResult.actualDeduction,
          requestedAmount: deductionResult.requestedAmount,
          newBalance: deductionResult.newBalance,
          countToday
        });
      } else {
        res.json({ success: true, message: '打卡成功', countToday });
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('完成任务失败:', error);
    res.status(500).json({ success: false, error: '操作失败' });
  }
});

// 补贴（补卡）
router.post('/subsidy', requireParent, async (req, res) => {
  try {
    const { taskId, memberId, subsidyDate, stickerReward } = req.body;
    const createdBy = req.member.id;

    if (!taskId || !memberId || !subsidyDate) {
      return res.status(400).json({ success: false, error: '请提供完整的补贴信息' });
    }

    const check = await getFamilyTask(req, taskId);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }

    const targetResult = await pool.query('SELECT family_id FROM members WHERE id = $1', [memberId]);
    if (targetResult.rows.length === 0 || targetResult.rows[0].family_id !== req.member.family_id) {
      return res.status(403).json({ success: false, error: '无权对该成员补贴' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(subsidyDate)) {
      return res.status(400).json({ success: false, error: '补贴日期格式无效' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 添加完成记录
      await client.query(
        'INSERT INTO task_completions (task_id, member_id, completed_date, count_today, is_subsidy, subsidy_date) VALUES ($1, $2, $3, 1, true, $3)',
        [taskId, memberId, subsidyDate]
      );

      // 补贴贴纸即时发放（家长操作，无需审批）
      await applyStickerChange(client, {
        memberId, amount: stickerReward || 1, changeType: 'subsidy',
        taskId, subsidyDate, createdBy,
      });

      await client.query('COMMIT');
      res.json({ success: true, message: '补贴成功' });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') {
        return res.status(400).json({ success: false, error: '该成员在这一天已有此任务的完成记录，无需补贴' });
      }
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('补贴失败:', error);
    res.status(500).json({ success: false, error: '操作失败' });
  }
});

// 获取本周开始日期
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 周一作为开始
  return new Date(d.setDate(diff));
}

export default router;
