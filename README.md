# OnMenu 点单原型

面向斐济堂食门店的单店试点，顾客、收银、厨房和店长使用独立入口。六道示例菜品、菜名中英双语；界面按浏览器语言初始化，也可手动切换。所有收款、退款和打印仍为模拟。

## 使用入口

- `/order`：顾客菜单、共享购物车、付款方式与个人订单进度；根路径 `/` 进入此页面。
- `/staff/cashier`：扫码及柜台订单、收款核验、现金找零、取消未付款订单、发起退款。
- `/staff/kitchen`：付款后的厨房队列、等待时长、开始制作、出餐与退款停止确认。
- `/staff/manager`：退款审批、净收款统计和可追溯操作记录。

这几个入口默认连接同一家示例门店，员工打开“桌面点餐码”选择桌号后，可将对应链接交给顾客。顾客页面没有员工导航；不同角色的 API 在服务端分别授权。

## 订单流程

1. 同桌顾客扫码后共同加菜，支持辣度、数量和备注。
2. 任意一人结算本轮购物车，选择现金或 M-PAiSA。提交后锁定菜品，前台收到待付款订单。
3. 现金顾客看到柜台付款指引及订单号；M-PAiSA 顾客看到由收银员核验转账的指引，当前不提供实际收款账号或在线付款。
4. 收银员确认到账后，一次性更新付款记录、生成模拟厨房小票、清空本轮购物车。重复或并发收款不会重复出单。
5. 厨房按收款时间排序，处理新订单、制作中和已出餐订单；顾客端同步显示进度。
6. 付款后加餐另开一单。原参与者可以继续跟踪旧订单，新加入的顾客看不到前一批人的已付款订单。
7. 退款由收银员申请、店长批准。待审核时暂停制作；批准后厨房看到明确的停止提示，并需确认收到。全部操作保留在日志中。

## 权限与数据范围

- 员工身份来自 Sites 转发的 `oai-authenticated-user-id` 和 `oai-authenticated-user-email`，客户端传入的角色不参与授权。
- 收银、厨房、店长分别使用 `CASHIER_ALLOWED_EMAILS`、`KITCHEN_ALLOWED_EMAILS`、`MANAGER_ALLOWED_EMAILS` 的服务端允许名单。
- 本次私密预览只给所有者账号开通这些岗位。不同员工的正式账号、入离职管理与 PIN/其他登录方式尚未实现。
- 顾客桌码用 `TABLE_LINK_SECRET` 签名，限制到指定门店与桌号。顾客接口不返回其他桌的购物车、后台统计、员工日志、交易参考号或现金盘点数据。
- 匿名浏览器参与者 ID 保存在 sessionStorage，仅用于关联自己参与的订单，必须同时持有有效桌码；订单与参与关系由 D1 保存。
- 厨房接口不返回未付款订单、购物车或支付交易号。旧的 `/api/demo` 接口返回 410，不能绕过新权限。
- 当前 Sites 仍为所有者私密访问，因此顾客预览链接也会遇到平台登录。正式营业的公开顾客入口需另行开放，员工名单仍需保留。
- 桌码可重复使用；实际营业前仍需完善门店闭店状态、防滥用与桌台占用规则。

## 数据与并发

数据持久化到 D1。每个演示空间使用带版本号的状态记录，通过条件更新处理多人并发。提交订单校验购物车版本，支付完成递增轮次，拒绝旧轮次请求。每个空间最多 200 张演示订单。

默认空间 ID 见 `lib/access-policy.ts`。员工可以通过 `/staff/cashier?room=<UUID>` 在独立演示空间工作，再生成该空间的桌码。旧空间没有删除，V2 新增字段均为兼容的可选字段，没有修改已应用的数据库迁移。

## 本地开发

使用 Node >=22.13。业务模型测试需要支持原生 TypeScript 类型剥离的 Node（本次使用 Node 25）。

```sh
npm install
cp .env.example .env
```

将 `.env` 的 `TABLE_LINK_SECRET` 换成至少 32 位随机字符。开发身份保留为 `seedy@sites.test`。`.env` 不应提交到 Git。

仅在空本地数据库初始化一次：

```sh
WRANGLER_LOG_PATH=.wrangler/logs npx wrangler d1 execute DB --local --config wrangler.local.json --file=drizzle/0000_bitter_silver_surfer.sql
npm run dev -- --host 0.0.0.0
```

打开 `/staff/cashier` 并点击登录，使用官方脚手架的本地开发身份。生产身份由托管平台验证，生产配置只在 Sites 中维护。

## 验证

```sh
node --test tests/*.test.mjs
node tests/api-flow.mjs
npx tsc --noEmit
npm run build
```

14 项模型与权限测试，以及本地真实 HTTP 并发流程验证覆盖：付款方式、桌码篡改、伪造角色和身份、跨桌访问、新顾客历史隔离、重复提交、并发付款、找零、厨房付款门槛、退款暂停及停止确认。HTTP 测试要求开发服务运行，会创建独立测试数据，且仅允许本地测试地址。

顾客端 WebMCP 的读取、有效加菜与无效菜品拒绝已在支持的浏览器上下文验证。没有进行全面的浏览器点击或视觉回归测试。

## 当前营业限制

没有真实 M-PAiSA 自动确认、人民币支付、实体打印机连接、真实退款到账、底钱与现金盘点、营业日结和五店管理。当前菜单照片为生成的示例图片，真实食材、过敏原和售价待确认。

## 代码组织

- `app/order`、`app/staff/*`：独立页面入口和服务器访问检查。
- `components/onmenu/`：共享菜单、订单控件及各端工作界面。
- `lib/order-model.ts`：菜单、金额、购物车和订单状态规则。
- `lib/access-policy.ts`、`lib/server-access.ts`：角色能力、桌码签名和数据范围。
- `lib/order-api.ts`、`app/api/guest`、`app/api/staff/*`：经过授权的持久化接口。
- `db/schema.ts`、`drizzle/`：数据库结构和不可变迁移。

## 流程参考

- [Square QR ordering](https://squareup.com/us/en/online-ordering/qr-code-ordering)：桌码对应位置，顾客点单与 POS、厨房衔接。
- [Toast kiosk cash payment](https://support.toasttab.com/en/article/Kiosk-Placing-Orders-Making-Payments-and-Tipping)：顾客选择现金后，携带订单信息到柜台结算。

这些资料用于参考业务流程；当前没有接入或依赖 Square、Toast 的收款服务。
