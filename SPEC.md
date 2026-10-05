# 业务规格（SPEC）

记录奖章星球的核心业务规则与不变量。**改行为之前先改这里**，代码与规格不一致视为 bug。

## 1. 货币体系

- **贴纸（sticker）**：活动货币。成员有 `current_stickers`（可花余额）与 `total_stickers`（历史累计，仅正向 `earn` 计入）。
- **粉球（ball）**：消费货币，由贴纸自动结转而来，另有家长调分入口。
- **结转规则**：贴纸余额 ≥ 160 时，整除部分自动转为粉球（`STICKERS_PER_BALL = 160`，唯一定义在 `server/src/lib/economy.js`），保留余数。
- **余额不允许为负**：扣减最多扣到 0。
- **记账不变量**：所有余额变动必须经 `lib/economy.js`，余额与流水（`sticker_logs` / `ball_logs`，含 `balance_after` 字段）在同一事务内更新；转粉球在**两侧各记一条 `convert` 流水**（贴纸侧为负数）。
- **对账恒等式**：`current_stickers == SUM(sticker_logs.sticker_change)`，`current_balls == SUM(ball_logs.ball_change)`。可用 `server/scripts/reconcile.js` 核验（修复前的历史数据可能不满足，脚本输出有说明）。

## 2. 贴纸发放语义（方案 A：审批发放）

| 事件 | 贴纸何时变动 | 流水类型 |
|------|------------|---------|
| 普通任务打卡 | 不变动，只记完成记录 | — |
| 提交申请 + 家长批准 | 批准时发放 | `earn` |
| 坏习惯打卡 | 即时扣除（余额不足按余额扣） | `penalty` |
| 家长补贴（补卡） | 即时发放，记补贴日期 | `subsidy` |
| 家长调分 | 即时（earn / penalty / adjust） | 同名 |
| 贴纸满 160 结转 | 自动，两侧记账 | `convert` |

- 同一任务存在 `pending` 申请时，重复提交会被跳过（服务端查重 + 前端按日期记忆）。
- 坏习惯任务强制单次、达标型语义，不进入审批流。

## 3. 任务

- **category**：`habit`（好习惯）/ `bad_habit`（坏习惯）/ `temporary`（临时）。
- **repeat_rule**：`daily` 每天；`weekly` 与创建日同星期几；`monthly` 与创建日的"日"号相同（31 号创建的任务在小月取月末）；`custom` 自定义 N 天有效期。
- **定量任务**（`target_count > 1`）：当日累计 `count_today`；
  - `pass_or_fail` 达标型：达到目标次数才算完成，申请按单次奖励额提交；
  - `cumulative` 累计型：每次打卡都算，申请按 `奖励额 × 次数` 提交。
- **temporary**：`valid_days` 为空/0 仅限当天，>0 表示创建日起 N 天内有效。

## 4. 抽卡（gacha）

- 单抽 10 粉球，十连 100 粉球；十连 = 10 次独立抽取，**每抽一条记录**（`total_pulls = 1`）。
- 稀有度概率：五星 1% / 四星 9% / 三星 30% / 普通 60%。
- **保底**：累计 90 抽必出五星（`gacha_pity_counter`，出五星即清零，保底抽不受概率影响）。
- 某稀有度在奖池无候选时：先向更低稀有度降级，再向更高稀有度升级。
- 抽中进入 `pet_collections`（同名奖励合并计数）。

## 5. 商店与兑换

- 奖励属性：`required_balls`（所需粉球）、`stock`（库存，-1 无限）、`is_gacha_pool`（入池）、`is_exchangeable`（可兑换）。
- 兑换：扣粉球 → 库存 -1 → 生成 `pending` 兑换记录 → 家长确认后 `confirmed`。全程事务内，奖励行与成员行加锁。

## 6. 权限与并发

- 身份一律取自 JWT（`req.member`），不信任请求体传入的 ID；家长专属操作校验 `requireParent`；跨成员/跨家庭访问校验 `family_id`。
- 同一成员的余额操作靠成员行 `FOR UPDATE` 串行化，不同成员/家庭互不阻塞。
- 密码 scrypt 哈希存储，任何接口不返回密码字段。
