// 贴纸/粉球账务的唯一出口：所有余额变动必须经过本模块，
// 保证「余额更新 + 流水日志 + 满额自动转粉球」三者始终一致。

export const STICKERS_PER_BALL = 160;

// 增加贴纸（earn=奖励, subsidy=补贴, adjust=调整，可为负）
// total_stickers 仅在正向 earn 时累计，用于历史总量的统计口径
export async function applyStickerChange(client, {
  memberId, amount, changeType,
  taskId = null, applicationId = null, remark = null, subsidyDate = null, createdBy = null,
}) {
  if (!Number.isInteger(amount)) throw new Error('贴纸数量必须为整数');
  if (!['earn', 'subsidy', 'adjust'].includes(changeType)) throw new Error('无效的贴纸变动类型');

  const memberResult = await client.query(
    'SELECT current_stickers, current_balls FROM members WHERE id = $1 FOR UPDATE',
    [memberId]
  );
  const member = memberResult.rows[0];
  if (!member) throw new Error('成员不存在');

  let newBalance = (member.current_stickers || 0) + amount;
  if (newBalance < 0) newBalance = 0; // 不允许负余额
  const totalIncrease = changeType === 'earn' && amount > 0 ? amount : 0;

  await client.query(
    'UPDATE members SET current_stickers = $1, total_stickers = total_stickers + $2 WHERE id = $3',
    [newBalance, totalIncrease, memberId]
  );

  await client.query(
    `INSERT INTO sticker_logs (member_id, task_id, application_id, change_type, sticker_change, balance_after, subsidy_date, remark, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [memberId, taskId, applicationId, changeType, amount, newBalance, subsidyDate, remark, createdBy]
  );

  // 满额自动转粉球：整除部分全部转出，保留余数（余额变动方向向下时也允许结转，保证余额终态一致）
  if (newBalance >= STICKERS_PER_BALL) {
    const ballsEarned = Math.floor(newBalance / STICKERS_PER_BALL);
    const remainingStickers = newBalance % STICKERS_PER_BALL;
    const newBallBalance = (member.current_balls || 0) + ballsEarned;

    await client.query(
      'UPDATE members SET current_stickers = $1, current_balls = $2, total_balls = total_balls + $3 WHERE id = $4',
      [remainingStickers, newBallBalance, ballsEarned, memberId]
    );

    await client.query(
      `INSERT INTO ball_logs (member_id, change_type, ball_change, balance_after, remark)
       VALUES ($1, 'convert', $2, $3, $4)`,
      [memberId, ballsEarned, newBallBalance, `${ballsEarned}个粉球（${STICKERS_PER_BALL}贴纸兑换）`]
    );
  }

  return { stickerBalance: newBalance };
}

// 扣除贴纸（坏习惯打卡、惩罚类申请）：不允许扣成负数，total_stickers 不变
export async function deductStickers(client, {
  memberId, amount, taskId = null, remark = null, createdBy = null, changeType = 'penalty',
}) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('扣除数量必须为正整数');

  const memberResult = await client.query(
    'SELECT current_stickers FROM members WHERE id = $1 FOR UPDATE',
    [memberId]
  );
  const member = memberResult.rows[0];
  if (!member) throw new Error('成员不存在');

  const currentBalance = member.current_stickers || 0;
  const actualDeduction = Math.min(amount, currentBalance);
  const newBalance = currentBalance - actualDeduction;

  if (actualDeduction > 0) {
    await client.query(
      'UPDATE members SET current_stickers = $1 WHERE id = $2',
      [newBalance, memberId]
    );

    await client.query(
      `INSERT INTO sticker_logs (member_id, task_id, change_type, sticker_change, balance_after, remark, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [memberId, taskId, changeType, actualDeduction, newBalance, remark, createdBy]
    );
  }

  return { actualDeduction, newBalance, requestedAmount: amount };
}
