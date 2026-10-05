import pool from '../db.js';
import crypto from 'crypto';

const useMemory = process.env.USE_MEMORY_DB === 'true';

// 初始化数据库表
export async function initDatabase() {
  if (useMemory) {
    console.log('✅ 使用内存数据库模式');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query(`
      -- 家庭表
      CREATE TABLE IF NOT EXISTS families (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_code VARCHAR(7) UNIQUE NOT NULL,
        name VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 成员表
      CREATE TABLE IF NOT EXISTS members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id UUID REFERENCES families(id) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('parent', 'child')),
        current_stickers INT DEFAULT 0,
        total_stickers INT DEFAULT 0,
        current_balls INT DEFAULT 0,
        total_balls INT DEFAULT 0,
        password VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 任务表
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id UUID REFERENCES families(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(200),
        
        -- 任务大类：habit=习惯任务, temporary=临时任务
        category VARCHAR(20) NOT NULL CHECK (category IN ('habit', 'temporary')),
        
        -- 重复规则：daily=每天, weekly=每周, monthly=每月, custom=自定义天数
        repeat_rule VARCHAR(20) DEFAULT 'daily',
        
        -- 自定义天数（repeat_rule=custom时使用）
        custom_days INT DEFAULT NULL,
        
        -- 累计次数目标（默认1，>1时为周期打卡）
        target_count INT DEFAULT 1,
        
        -- 定量任务累计模式：cumulative=累计型, pass_or_fail=达标型
        accumulative_mode VARCHAR(20) DEFAULT 'pass_or_fail',
        
        -- 临时任务有效期天数（仅当category=temporary时使用，NULL表示仅限当天）
        valid_days INT DEFAULT NULL,
        
        -- 贴纸奖励（每完成一次目标获得的数量）
        sticker_reward INT NOT NULL DEFAULT 1,
        
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES members(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 任务完成记录表
      CREATE TABLE IF NOT EXISTS task_completions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        completed_date DATE NOT NULL,
        
        -- 当天完成的次数（用于定量任务）
        count_today INT DEFAULT 1,
        
        -- 是否是补贴（补卡）
        is_subsidy BOOLEAN DEFAULT false,
        -- 补贴的实际日期（补哪天的）
        subsidy_date DATE DEFAULT NULL,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(task_id, member_id, completed_date)
      );

      -- 申请表（审批流程）
      CREATE TABLE IF NOT EXISTS applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        applicant_id UUID REFERENCES members(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        application_type VARCHAR(20) NOT NULL CHECK (application_type IN ('earn', 'penalty', 'custom')),
        requested_stickers INT NOT NULL,
        reason VARCHAR(200),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewer_id UUID REFERENCES members(id),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 贴纸日志表
      CREATE TABLE IF NOT EXISTS sticker_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
        change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('earn', 'penalty', 'convert', 'adjust', 'subsidy')),
        sticker_change INT NOT NULL,
        balance_after INT NOT NULL,
        remark VARCHAR(200),
        -- 补贴日期（用于记录补哪天的贴纸）
        subsidy_date DATE DEFAULT NULL,
        created_by UUID REFERENCES members(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 粉球记录表
      CREATE TABLE IF NOT EXISTS ball_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('convert', 'use', 'reward')),
        ball_change INT NOT NULL,
        balance_after INT NOT NULL,
        remark VARCHAR(200),
        related_sticker_log_id UUID REFERENCES sticker_logs(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 奖励池表
      CREATE TABLE IF NOT EXISTS rewards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id UUID REFERENCES families(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(200),
        tier VARCHAR(20) DEFAULT '普通',
        required_balls INT NOT NULL DEFAULT 10,
        is_gacha_pool BOOLEAN DEFAULT false,
        is_exchangeable BOOLEAN DEFAULT true,
        is_claimed BOOLEAN DEFAULT false,
        claimed_by UUID REFERENCES members(id),
        claimed_at TIMESTAMP,
        stock INT DEFAULT -1,
        icon VARCHAR(50) DEFAULT '🎁',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 奖励兑换记录表
      CREATE TABLE IF NOT EXISTS reward_exchanges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reward_id UUID REFERENCES rewards(id) ON DELETE CASCADE,
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        cost_balls INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 抽卡记录表
      CREATE TABLE IF NOT EXISTS gacha_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        reward_id UUID REFERENCES rewards(id),
        total_pulls INT NOT NULL,
        is_guaranteed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 成就表
      CREATE TABLE IF NOT EXISTS achievements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        achievement_key VARCHAR(50) NOT NULL,
        achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(member_id, achievement_key)
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_members_family ON members(family_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks(family_id);
      CREATE INDEX IF NOT EXISTS idx_applications_applicant ON applications(applicant_id);
      CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
      CREATE INDEX IF NOT EXISTS idx_sticker_logs_member ON sticker_logs(member_id);
      CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_date);
    `);

    // 扩展任务分类：添加 bad_habit（坏习惯）
    await client.query(`
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_category_check;
      ALTER TABLE tasks ADD CONSTRAINT tasks_category_check CHECK (category IN ('habit', 'temporary', 'bad_habit'));
    `);

    // 为已有的 rewards 表添加新字段（兼容旧数据库）
    await client.query(`
      ALTER TABLE rewards ADD COLUMN IF NOT EXISTS stock INT DEFAULT -1;
      ALTER TABLE rewards ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT '🎁';
      ALTER TABLE rewards ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
    `);

    // 为 members 表添加抽卡保底计数器（距上次出五星的累计抽卡次数）
    await client.query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS gacha_pity_counter INT DEFAULT 0;
    `);

    // 为 members 表添加头像字段
    await client.query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar VARCHAR(10) DEFAULT NULL;
    `);

    // 密码列扩容以容纳 scrypt 哈希（约180字符）
    await client.query(`
      ALTER TABLE members ALTER COLUMN password TYPE VARCHAR(200);
    `);

    // 宠物/奖励收藏表（抽卡获得的奖励会进入收藏）
    await client.query(`
      CREATE TABLE IF NOT EXISTS pet_collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        reward_id UUID REFERENCES rewards(id) ON DELETE SET NULL,
        reward_name VARCHAR(100) NOT NULL,
        reward_icon VARCHAR(50) DEFAULT '🎁',
        reward_tier VARCHAR(20) DEFAULT '普通',
        gacha_record_id UUID REFERENCES gacha_records(id) ON DELETE SET NULL,
        count INT DEFAULT 1,
        first_obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(member_id, reward_name)
      );
      CREATE INDEX IF NOT EXISTS idx_pet_collections_member ON pet_collections(member_id);
    `);

    console.log('✅ 数据库表初始化完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

// 生成唯一家庭码（7位字母+数字，去除易混淆字符，加密安全随机）
export function generateFamilyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}
