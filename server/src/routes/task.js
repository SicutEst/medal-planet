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
    const isParent = req.member.role === 'parent';

    // 坏习惯由家长记录：孩子端服务端直接过滤，不返回坏习惯任务
    const habitCategories = isParent ? "('habit', 'bad_habit')" : "('habit')";

    // 获取习惯任务，completed_count 为当日累计次数（无记录为 NULL）；
    // pending_count/approved_count 为当日已提交待审/已批的完成量（按次计件账目）
    const tasksResult = await pool.query(`
      SELECT t.*,
        (SELECT tc.count_today FROM task_completions tc
         WHERE tc.task_id = t.id AND tc.member_id = $2 AND tc.completed_date = $3 AND tc.is_subsidy = false LIMIT 1) as completed_count,
        (SELECT COALESCE(SUM(a.requested_count), 0) FROM applications a
         WHERE a.applicant_id = $2 AND a.task_id = t.id AND a.status = 'pending'
           AND a.requested_count IS NOT NULL
           AND a.created_at >= $3::date AND a.created_at < ($3::date + INTERVAL '1 day')) as pending_count,
        (SELECT COALESCE(SUM(a.requested_count), 0) FROM applications a
         WHERE a.applicant_id = $2 AND a.task_id = t.id AND a.status = 'approved'
           AND a.requested_count IS NOT NULL
           AND a.created_at >= $3::date AND a.created_at < ($3::date + INTERVAL '1 day')) as approved_count
      FROM tasks t
      WHERE t.family_id = $1 AND t.is_active = true AND t.category IN ${habitCategories}
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
        (SELECT COALESCE(SUM(a.requested_count), 0) FROM applications a
         WHERE a.applicant_id = $2 AND a.task_id = t.id AND a.status = 'pending'
           AND a.requested_count IS NOT NULL
           AND a.created_at >= $3::date AND a.created_at < ($3::date + INTERVAL '1 day')) as pending_count,
        (SELECT COALESCE(SUM(a.requested_count), 0) FROM applications a
         WHERE a.applicant_id = $2 AND a.task_id = t.id AND a.status = 'approved'
           AND a.requested_count IS NOT NULL
           AND a.created_at >= $3::date AND a.created_at < ($3::date + INTERVAL '1 day')) as approved_count
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

    // 合并结果；统一完成次数字段名为 count_today，并计算剩余可提交量：
    // unsubmitted_count = 当日完成 - 待审 - 已批（按次计件账目，服务端权威计算）
    const allTasks = [...todayTasks.map(t => ({ ...t, is_today: true })),
                      ...tempTasksResult.rows.map(t => ({ ...t, is_today: true }))]
      .map(t => {
        const c = Number(t.completed_count) || 0;
        // pg 的 SUM 返回字符串，必须显式转数字（否则相加会变成字符串拼接）
        const accounted = (Number(t.pending_count) || 0) + (Number(t.approved_count) || 0);
        const z = Math.max(0, c - accounted);
        return { ...t, count_today: c, is_completed_today: c, unsubmitted_count: z };
      });

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
        // 普通任务：每天一次；取消后残留的 count=0 行视为未完成，可重新打卡
        const existing = await client.query(
          'SELECT id, count_today FROM task_completions WHERE task_id = $1 AND member_id = $2 AND completed_date = $3',
          [id, memberId, targetDate]
        );

        if (existing.rows.length > 0 && (Number(existing.rows[0].count_today) || 0) > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, error: '今日已完成该任务' });
        }

        countToday = 1;
        if (existing.rows.length > 0) {
          await client.query('UPDATE task_completions SET count_today = 1 WHERE id = $1', [existing.rows[0].id]);
        } else {
          await client.query(
            'INSERT INTO task_completions (task_id, member_id, completed_date, count_today, is_subsidy, subsidy_date) VALUES ($1, $2, $3, 1, $4, $5)',
            [id, memberId, targetDate, isSubsidy, subsidyDate]
          );
        }
      }

      // 贴纸发放语义（按次计件）：打卡只累计完成量，贴纸经「提交 → 家长审批」按
      // 完成量 × 单次奖励 发放。唯一例外是坏习惯：家长记录后即时扣贴纸，不经过审批。
      let deductionResult = null;
      if (task.category === 'bad_habit') {
        // 坏习惯由家长记录：孩子端已在 /today 过滤不可见，接口层再拦一次
        if (req.member.role !== 'parent') {
          await client.query('ROLLBACK');
          return res.status(403).json({ success: false, error: '坏习惯由家长记录' });
        }
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

// 提交任务完成量（按次计件：剩余可提交 = 当日完成 - 待审 - 已批，服务端权威计算）
// 坏习惯即时扣分，不走提交
router.post('/:id/submit', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const memberId = req.member.id;
    const targetDate = getLocalDateString();

    const check = await getFamilyTask(req, id);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }
    const task = check.task;
    if (task.category === 'bad_habit') {
      return res.status(400).json({ success: false, error: '坏习惯任务即时扣分，无需提交' });
    }

    await client.query('BEGIN');

    // 锁定当日完成记录，串行化同一任务的并发提交
    const comp = await client.query(
      `SELECT count_today FROM task_completions
       WHERE task_id = $1 AND member_id = $2 AND completed_date = $3 AND is_subsidy = false FOR UPDATE`,
      [id, memberId, targetDate]
    );
    const doneCount = comp.rows[0]?.count_today || 0;

    const accountedRes = await client.query(
      `SELECT COALESCE(SUM(requested_count), 0) AS c FROM applications
       WHERE applicant_id = $1 AND task_id = $2 AND status IN ('pending', 'approved')
         AND requested_count IS NOT NULL
         AND created_at >= $3::date AND created_at < ($3::date + INTERVAL '1 day')`,
      [memberId, id, targetDate]
    );
    const submitCount = doneCount - (Number(accountedRes.rows[0].c) || 0);
    if (submitCount <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: '没有新完成量可提交（先打卡再提交）' });
    }

    const stickers = submitCount * task.sticker_reward;
    const reason = `完成「${task.name}」` + (submitCount > 1 ? ` ×${submitCount}` : '');
    const appResult = await client.query(
      `INSERT INTO applications (applicant_id, task_id, application_type, requested_stickers, requested_count, reason)
       VALUES ($1, $2, 'earn', $3, $4, $5) RETURNING *`,
      [memberId, id, stickers, submitCount, reason]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `已提交 ${submitCount} 次，等待家长审批（${stickers} 贴纸）`,
      application: appResult.rows[0],
      submittedCount: submitCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('提交任务失败:', error);
    res.status(500).json({ success: false, error: '操作失败' });
  } finally {
    client.release();
  }
});

// 取消今日打卡（重新点击已勾选的任务时调用）
// 只影响未提交的量：剩余可取消 = 当日完成 - 待审 - 已批；坏习惯与补贴记录不可取消
router.post('/:id/uncomplete', async (req, res) => {
  try {
    const { id } = req.params;
    const memberId = req.member.id;
    // body.count = 1 表示多计数任务递减一次；缺省为取消全部未提交量
    const { date, count } = req.body;
    const targetDate = date || getLocalDateString();

    const check = await getFamilyTask(req, id);
    if (check.error) {
      return res.status(check.code).json({ success: false, error: check.error });
    }
    if (check.task.category === 'bad_habit') {
      return res.status(400).json({ success: false, error: '坏习惯记录不支持取消' });
    }

    const comp = await pool.query(
      `SELECT count_today FROM task_completions
       WHERE task_id = $1 AND member_id = $2 AND completed_date = $3 AND is_subsidy = false`,
      [id, memberId, targetDate]
    );
    if (comp.rows.length === 0) {
      return res.status(404).json({ success: false, error: '今日没有该任务的打卡记录' });
    }

    const accountedRes = await pool.query(
      `SELECT COALESCE(SUM(requested_count), 0) AS c FROM applications
       WHERE applicant_id = $1 AND task_id = $2 AND status IN ('pending', 'approved')
         AND requested_count IS NOT NULL
         AND created_at >= $3::date AND created_at < ($3::date + INTERVAL '1 day')`,
      [memberId, id, targetDate]
    );
    const doneCount = Number(comp.rows[0].count_today) || 0;
    const accounted = Number(accountedRes.rows[0].c) || 0;
    const cancellable = doneCount - accounted;
    if (cancellable <= 0) {
      return res.status(409).json({ success: false, error: '没有可取消的未提交打卡' });
    }

    if (count === 1) {
      // 多计数任务：递减一次（不会减到已提交/已批的量）；减到 0 且无记账量时删除记录
      const newCount = doneCount - 1;
      if (newCount <= 0 && accounted === 0) {
        await pool.query(
          `DELETE FROM task_completions
           WHERE task_id = $1 AND member_id = $2 AND completed_date = $3 AND is_subsidy = false`,
          [id, memberId, targetDate]
        );
        return res.json({ success: true, message: '已取消今日打卡', countToday: 0 });
      }
      await pool.query('UPDATE task_completions SET count_today = $1 WHERE task_id = $2 AND member_id = $3 AND completed_date = $4', [newCount, id, memberId, targetDate]);
      return res.json({ success: true, message: '已减少一次打卡', countToday: newCount });
    }

    // 整条取消：计数回落到已记账的量；若无已记账量则删除记录
    if (accounted === 0) {
      await pool.query(
        `DELETE FROM task_completions
         WHERE task_id = $1 AND member_id = $2 AND completed_date = $3 AND is_subsidy = false`,
        [id, memberId, targetDate]
      );
      return res.json({ success: true, message: '已取消今日打卡', countToday: 0 });
    }
    await pool.query(
      'UPDATE task_completions SET count_today = $1 WHERE task_id = $2 AND member_id = $3 AND completed_date = $4',
      [accounted, id, memberId, targetDate]
    );
    res.json({ success: true, message: '已取消未提交的打卡', countToday: accounted });
  } catch (error) {
    console.error('取消打卡失败:', error);
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
