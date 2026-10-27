/* Only explicitly marked interface text is translated. Product/customer data,
   payment identifiers, amounts, and fiscal documents retain their original values. */
(() => {
  'use strict';
  const translations = Object.fromEntries(`
Language|语言
Sign in|登录
Welcome back to SoftPOS|欢迎回到 SoftPOS
Connected retail.|互联零售。
Smarter business.|智慧经营。
Your Vision.|您的愿景。
Our Technology.|我们的科技。
Company code|公司代码
Username|用户名
Password|密码
Show password|显示密码
Hide password|隐藏密码
Company|公司
Open SoftPOS|进入 SoftPOS
Install SoftPOS|安装 SoftPOS
Shop|门店
Online|在线
Offline|离线
Connection & offline sales|连接与离线销售
Prepare offline|准备离线销售
Offline sales|离线销售
Sync now|立即同步
System Setting|系统设置
System settings|系统设置
Softnet master|Softnet 管理平台
Change password|修改密码
Log out|退出登录
Dashboard|概览
Sale|销售
Stock|库存
Reprint Receipt|重打收据
Refunds|退款
Held tables|挂单桌台
Quotations|报价单
Product Management|商品管理
Layby|分期预留
LAYBY|分期预留
X / Z REPORTS|X / Z 报表
Products|商品
Stock & PO|库存与采购单
PO & Receiving|采购单与收货
X / Z reports|X / Z 报表
Reports|报表
Sales performance across your permitted locations.|查看您有权访问的各门店销售业绩。
Close|关闭
Daily net sales|每日净销售额
Top products|畅销商品
Sales reports|销售报表
Sales, stock movements, product balances and component assignments.|销售、库存变动、商品结存及组件分配。
Print|打印
Email|电子邮件
Share|分享
Previous|上一页
Next|下一页
Amounts include VAT. Refunds reduce net sales. Totals use invoice line values before invoice rounding.|金额含增值税。退款将减少净销售额。合计使用发票舍入前的明细金额。
Scan|扫码
Clear|清除
Clear search|清除搜索
search|搜索
Grid|网格
List|列表
▦ Enter price|▦ 输入价格
▦ Grid|▦ 网格
☷ List|☷ 列表
Clear price|清除价格
Enter a price, then select a product. Leave blank for the retail price.|先输入价格，再选择商品。留空则使用零售价。
Price keypad|价格键盘
No matching products found.|未找到匹配的商品。
Sale Cart|购物车
Customer|客户
Walk-in customer|散客
Select customer|选择客户
No items added|尚未添加商品
Select a product to begin.|选择商品以开始销售。
Subtotal (ex VAT)|小计（不含增值税）
Subtotal|小计
Discount|折扣
VAT included|已含增值税
Total|合计
Checkout|结账
Checkout is not configured for this company yet.|此公司尚未配置结账功能。
Hold to table|挂单到桌台
Make quotation|创建报价单
RESTAURANT ORDERS|餐饮订单
Orders saved here can also be resumed in desktop SoftPOS.|此处保存的订单也可在桌面版 SoftPOS 中继续处理。
Refresh|刷新
No held table orders.|暂无桌台挂单。
CUSTOMER SALES|客户销售
Recent quotations|最近报价单
Quotations created by SoftPOS desktop and web.|桌面版和网页版 SoftPOS 创建的报价单。
Quotation|报价单
Date|日期
User|用户
Status|状态
No quotations found.|暂无报价单。
Create & manage products|创建与管理商品
Product details are shared across shops. New products start with zero stock at the selected shop.|商品资料在各门店共享。新商品在所选门店的初始库存为零。
Create product|创建商品
Product code|商品编码
Product name|商品名称
Department|部门
Manage|管理
Category|类别
Retail price (FJD)|零售价（斐济元）
Cost price (FJD)|成本价（斐济元）
Unit of measure|计量单位
VAT|增值税
Stock Item|库存商品
Product image (optional)|商品图片（可选）
PNG or JPEG, under 2 MB.|PNG 或 JPEG 格式，小于 2 MB。
Manage products|管理商品
Search|搜索
Showing up to 50 active products at the selected shop.|最多显示所选门店的 50 个启用商品。
Edit product|编辑商品
Replace product image (optional)|替换商品图片（可选）
Remove image|移除图片
Assign components|分配组件
Cancel|取消
Save changes|保存更改
Stock & purchase orders|库存与采购单
Create PO|创建采购单
Print PO|打印采购单
Receive PO|按采购单收货
Receive without PO|无采购单收货
Stock Adjustment|库存调整
Search supplier|搜索供应商
Supplier|供应商
Create Supplier|创建供应商
Note|备注
Find a product|查找商品
Post purchase order|提交采购单
Receive Stock Against PO|按采购单入库
Find a purchase order|查找采购单
PO Number|采购单号
Refresh Open POs|刷新未完成采购单
Receiving details|收货详情
Selected Purchase Order|所选采购单
Supplier Invoice No|供应商发票号
Invoice Date|发票日期
Items to receive|待收货商品
Find Item|查找商品
Enter the qty received. Cost is taken from the PO; VAT uses the company's configured rate.|输入实收数量。成本采用采购单价格，增值税采用公司配置的税率。
Receive Stock|收货入库
Stock Receive Without PO|无采购单入库
Search Supplier|搜索供应商
Quantities are purchase packs; receiving adds packs × pack size to stock. This records stock receipt; supplier billing is handled separately.|数量以采购包装为单位，入库数量为包装数乘以每包数量。此操作记录收货，供应商账单另行处理。
Receive stock|收货入库
Select a product.|请选择商品。
Adjustment type|调整类型
Quantity change (+ add / − remove)|数量变动（+ 增加 / − 减少）
Reason|原因
Post adjustment|提交调整
Find the invoice, choose the items, then complete the refund.|查找发票，选择商品，然后完成退款。
Reprint refund|重打退款单
Invoice number|发票号码
Find invoice|查找发票
Return all|全部退货
Enter the quantity to return. Stock is updated automatically.|输入退货数量，库存将自动更新。
Total refund|退款合计
Return payment by|退款方式
Cash|现金
Card|银行卡
Cheque|支票
Voucher|代金券
EBanking|网上银行
Original split payment|原混合付款方式
Refund reference|退款参考号
Reason for refund|退款原因
Return the money through your payment provider, then enter its refund reference.|通过支付服务商退回款项，然后输入退款参考号。
Complete refund|完成退款
Your web sales at the selected shop since your previous Z report. Desktop sales and till sessions are separate.|所选门店自上次 Z 报表以来的网页销售记录。桌面销售与收银班次单独记录。
View X report|查看 X 报表
Previous Z reports|历史 Z 报表
Print report|打印报表
Counted sales cash, excluding opening float (optional)|实点销售现金，不含备用金（可选）
Z saves these totals and closes this web reporting period. It does not delete sales or submit a VMS fiscal report.|Z 报表保存合计并结束本次网页报表周期，不会删除销售记录或提交 VMS 财税报表。
Save Z & close period|保存 Z 报表并结束周期
View Cart →|查看购物车 →
Cart|购物车
More|更多
Enter item price|输入商品价格
Select a product →|选择商品 →
Complete payment|完成付款
Complete sale|完成销售
Payment received · Complete sale|已收到付款 · 完成销售
Cash received|实收现金
Card amount before surcharge|手续费前的银行卡金额
Remaining to pay|剩余应付
Cash change|现金找零
Added payments|已添加付款
Select a method and confirm the amount.|选择付款方式并确认金额。
Total due|应付总额
Payment method|付款方式
Notes & coins|纸币与硬币
Mobile wallet|手机钱包
Bank cheque|银行支票
Debit terminal|借记卡终端
Credit Card|信用卡
Card terminal|银行卡终端
Voucher payment|代金券付款
Bank transfer|银行转账
Sale amount|销售金额
Credit card surcharge|信用卡手续费
Cash round-off (nearest 5 cents)|现金舍入（至最接近的 5 分）
Amount due|应付金额
Amount received|实收金额
Exact|实收正好
Done|完成
Bank|银行
Select bank…|选择银行…
Transaction reference (optional)|交易参考号（可选）
I confirm this external payment was received.|我确认已收到此外部付款。
Add split payment|添加混合付款
Done · Complete sale|完成销售
Invoice|发票
Verify receipt|验证收据
Share image lets you choose WhatsApp or Viber if installed on this device.|分享图片时，可选择此设备上已安装的 WhatsApp 或 Viber。
Send receipt by email|通过电子邮件发送收据
Choose your email app. Gmail and Outlook web may ask you to sign in. Save image first if you want to attach it in webmail.|选择邮件应用。Gmail 和 Outlook 网页版可能要求登录。如需添加图片附件，请先保存图片。
Installed email app + image|已安装的邮件应用与图片
Gmail web|Gmail 网页版
Outlook web|Outlook 网页版
Default email app|默认邮件应用
Share image|分享图片
Save image|保存图片
Invoice no|发票号
HOLD ORDER|挂单
Select a table|选择桌台
Hold order|保存挂单
NEW QUOTATION|新建报价单
Select a customer|选择客户
Reference|参考信息
Save quotation|保存报价单
Working…|处理中…
Install now|立即安装
The shortcut opens SoftPOS as an app. Internet is required to sign in and sync. Prepare a trusted device to record sales offline.|此快捷方式将以应用形式打开 SoftPOS。登录与同步需要网络。请在可信设备上准备离线销售数据。
Changing your web account password signs you out on all devices. Hold your current sale first if needed.|修改网页账户密码后，所有设备均会退出登录。如有需要，请先保存当前销售挂单。
Current password|当前密码
New password|新密码
Use 12 to 128 characters.|请使用 12 至 128 个字符。
Confirm new password|确认新密码
Show passwords|显示密码
Scan product barcode|扫描商品条码
Scan photo|扫描照片
Camera|相机
Light on|打开补光灯
Point the camera at the product barcode.|请将相机对准商品条码。
Barcode|条码
Find product|查找商品
Scan another|继续扫描
Prepare offline sales|准备离线销售
Save this shop's products and prices on this device. Offline access lasts 8 hours after the download. Walk-in cash, Card and M-PAiSA sales are available offline. Confirm external payments on the terminal or service before recording them. Stock is a last downloaded estimate, not reserved. Price, tax or access changes detected during sync need review.|将本店商品及价格保存到此设备。下载后可离线使用 8 小时，支持散客现金、银行卡和 M-PAiSA 销售。记录外部付款前，请先在终端或支付服务中确认到账。库存是上次下载的估计值，并未预留。同步时发现的价格、税率或权限变更需要审核。
Pending sales stay on this device until synced. Keep the app open when reconnecting. Do not clear browser data or uninstall while sales are pending.|待同步销售保存在此设备上。重新联网时请保持应用打开。有待同步销售时，请勿清除浏览器数据或卸载应用。
This is a trusted device; my signed-in account may resume offline during the next 8 hours.|这是可信设备，允许当前账户在未来 8 小时内恢复离线使用。
Download offline data|下载离线数据
Offline sales on this device|此设备上的离线销售
Sign in as the original cashier to sync. Needs review means the saved sale was not accepted; keep its reference and contact your administrator.|请使用原收银员账户登录并同步。“需要审核”表示保存的销售未被接受，请保留参考号并联系管理员。
Sync now / retry|立即同步 / 重试
Export backup|导出备份
Offline receipt|离线收据
Print pending receipt|打印待同步收据
Quantity used for each 1 of this non-stock product sold. Active assignments are shared with desktop. Non-stock components can have their own recipes.|每售出 1 个此非库存商品所消耗的数量。启用的分配与桌面版共享。非库存组件可有自己的配方。
Find a component|查找组件
Save components|保存组件
Sales report|销售报表
Download PDF|下载 PDF
Email / Share PDF|邮件 / 分享 PDF
Open email draft|打开邮件草稿
Create Customer|创建客户
Customer name|客户名称
Phone / Mobile|电话 / 手机
TIN|税务识别号
Address|地址
Save and select customer|保存并选择客户
Purchase order|采购单
PO number|采购单号
Back to list|返回列表
Supplier name|供应商名称
Phone|电话
Save and select supplier|保存并选择供应商
Held sales|销售挂单
No held sales for this shop.|本店暂无销售挂单。
Service description|服务说明
Description|说明
Save description|保存说明
Enter quantity|输入数量
Quantity|数量
Apply quantity|应用数量
Item discount|商品折扣
Discount type|折扣类型
Percent %|百分比 %
FJD per item|每件斐济元
Percentage (%)|百分比（%）
Remove discount|移除折扣
Apply discount|应用折扣
Department management|部门管理
Create and update the groups used by products.|创建和更新商品分组。
Category management|类别管理
Find an entry|查找条目
New department|新建部门
New entry|新建条目
Code|编码
Name|名称
Active department|启用部门
Description (optional)|说明（可选）
Create department|创建部门
Changes are shared with desktop products. Product selections update after saving.|更改与桌面版商品共享。保存后更新商品选项。
Edit unit price|修改单价
Unit price (FJD)|单价（斐济元）
Apply price|应用价格
Clear this sale?|清空本次销售？
Keep sale|保留销售
Clear cart|清空购物车
System Setting · SoftPOS|系统设置 · SoftPOS
Back to POS|返回收银台
Sales options|销售选项
Users|用户
Forms|表单
Customer Management|客户管理
Supplier Management|供应商管理
Sales Rep Management|销售代表管理
Add new|新增
Active|启用
Inactive|停用
Role access|角色权限
Cash Customer|现金客户
More sales actions|更多销售操作
Select sales rep|选择销售代表
Print till|打印收银汇总
Additional Note|附加备注
Sale note|销售备注
Save note|保存备注
Print format|打印格式
Thermal receipt|热敏小票
A4 invoice|A4 发票
A5 invoice|A5 发票
SALES REP|销售代表
PRINT DRAFT BILL|打印草稿账单
ADDITIONAL NOTE|附加备注
PRINT TILL|打印收银汇总
REFUND|退款
REPRINT RECEIPT|重打收据
Sales rep|销售代表
No sales rep|未选销售代表
Print draft bill|打印草稿账单
Print draft|打印草稿
Enable draft bill printing|启用草稿账单打印
Enable sales rep selection|启用销售代表选择
VMS certificate|VMS 证书
License|许可证
Loading…|加载中…
Signed-in users|已登录用户
License ends|许可证到期日
Company license changes are handled by the central administrator.|公司许可证变更由中央管理员处理。
Company details|公司资料
Company name|公司名称
Company name is managed by the central administrator.|公司名称由中央管理员管理。
Company TIN No.|公司税务识别号
Mobile No.|手机号码
Telephone No.|电话号码
Fax No.|传真号码
Website|网站
VAT (%)|增值税（%）
Credit card fee (%)|信用卡手续费（%）
ECAL (%)|ECAL（%）
PBL (value)|PBL（金额）
Physical address|实际地址
Line 1|第 1 行
Line 2|第 2 行
Line 3|第 3 行
Line 4|第 4 行
Postal address|邮寄地址
Save company details|保存公司资料
Loading company details…|正在加载公司资料…
Company logo|公司标志
This logo appears on printed purchase orders. PNG or JPEG, under 2 MB.|此标志将显示在打印的采购单上。PNG 或 JPEG 格式，小于 2 MB。
Choose logo|选择标志
Upload logo|上传标志
Remove logo|移除标志
Enable product components|启用商品组件
Assign components to non-stock products. Completed sales deduct active component quantities using desktop assignments.|为非库存商品分配组件。销售完成后，按桌面版分配扣减已启用的组件数量。
Enable camera barcode scanning in Sale|销售时启用相机扫码
Enable price-entry keypad|启用价格输入键盘
Users can enter a price before selecting a product. This changes the sale item price only.|用户可先输入价格再选择商品，仅修改本次销售的商品价格。
Show product codes on product tiles|在商品卡片上显示编码
Allow service descriptions in Sale|允许在销售中填写服务说明
Users can describe service and non-stock items in the sale cart.|用户可在购物车中填写服务与非库存商品的说明。
Enable sales discounts|启用销售折扣
Enable Hold and Resume sales|启用销售挂单与恢复
Active receipt paper size|当前收据纸张尺寸
Applies to sale, refund and offline receipts for this company. Select matching paper in the printer settings and print at 100% scale.|适用于本公司的销售、退款及离线收据。请在打印设置中选择对应纸张，并以 100% 比例打印。
Accepted payment types|可用付款方式
Only selected types appear at checkout. Choose at least one.|结账时仅显示选中的方式，请至少选择一种。
Save settings|保存设置
Choose which functions each role can use in this company. Admin and SuperAdmin retain full access.|选择各角色在本公司可使用的功能。Admin 和 SuperAdmin 保留全部权限。
Save role access|保存角色权限
Email users|邮箱用户
Disable access immediately when a person should no longer sign in.|当某人不应再登录时，请立即停用其访问权限。
POS operator|收银操作员
Action|操作
No email users are linked to this company yet.|此公司尚未关联邮箱用户。
Invite an email user|邀请邮箱用户
Create a company user|创建公司用户
Enter the person's name and email, choose a company role and shop, then create their invitation. They choose their own sign-in password. Configure each role's permissions in the Role access tab.|输入姓名和邮箱，选择公司角色与门店后创建邀请。用户将自行设置登录密码。各角色权限可在“角色权限”选项卡中配置。
Full name|姓名
Email address|电子邮箱
Account role|账户角色
Loading company roles…|正在加载公司角色…
Loading shops…|正在加载门店…
Create operator and invitation|创建操作员及邀请
Choose a role to see its shop access.|选择角色以查看其门店访问权限。
Loading company shops…|正在加载公司门店…
Invite an existing POS operator|邀请现有收银操作员
Link an existing POS operator to an email sign-in. The app emails the invitation when mail delivery is configured; you can also copy the one-time link.|将现有收银操作员关联到邮箱登录。配置邮件服务后，应用将发送邀请邮件，也可复制一次性链接。
Loading POS operators…|正在加载收银操作员…
Create invitation|创建邀请
New link|新建链接
Copy link|复制链接
This link is shown once. Share it only with the intended person.|此链接仅显示一次，请仅分享给指定人员。
Pending invitations|待接受邀请
No pending invitations.|暂无待接受邀请。
Set VMS for each shop. Off prints a clearly marked test invoice without VMS. A shop can use another shop's certificate only when both use the same registered location. Upload a sandbox PFX for each certificate shop; enter its FRCS password and PAC separately. Credentials are encrypted on the server and never shown again.|为每个门店设置 VMS。关闭后将打印明确标注的无 VMS 测试发票。只有使用同一注册地点的门店才可共用证书。请为各证书门店上传沙盒 PFX，并分别输入 FRCS 密码和 PAC。凭据在服务器上加密保存，不再显示。
Checking shops…|正在检查门店…
Upload a shop certificate|上传门店证书
Certificate shop|证书所属门店
Certificate (.pfx or .p12)|证书（.pfx 或 .p12）
Certificate password|证书密码
POS Access Code (PAC)|POS 访问码（PAC）
I confirm this certificate belongs to the selected shop's FRCS registered location.|我确认此证书属于所选门店的 FRCS 注册地点。
Upload and verify|上传并验证
Softnet master · SoftPOS|Softnet 管理平台 · SoftPOS
SOFTNET CONTROL|SOFTNET 管理
SoftPOS master|SoftPOS 管理平台
PLATFORM ADMINISTRATOR|平台管理员
Sign in to manage clients|登录以管理客户公司
Use your approved Softnet master email account.|请使用已获授权的 Softnet 管理邮箱账户。
Open master portal|进入管理平台
COMPANY DIRECTORY|公司目录
Manage SoftPOS clients|管理 SoftPOS 客户公司
Licenses and database routing are controlled here. Client administrators manage their own users.|在此管理许可证与数据库路由。客户管理员管理各自的用户。
Companies|公司
Active licenses|有效许可证
Clients|客户公司
Choose a company to manage its license and first administrator.|选择公司以管理许可证和首位管理员。
Find company|查找公司
No companies match this search.|未找到匹配的公司。
Client Settings|客户设置
New Client Setup|新客户设置
Choose a client from the list to view its settings and online users.|从列表中选择客户以查看设置及在线用户。
CLIENT SETTINGS|客户设置
Online users|在线用户
Available places|可用名额
Refresh count|刷新人数
Updates every 30 seconds.|每 30 秒更新一次。
Counts active sign-ins. Closed or disconnected browsers can remain counted for up to 15 minutes.|统计活跃登录。浏览器关闭或断网后，最多仍会计入 15 分钟。
Database connection:|数据库连接：
License ends (UTC date)|许可证到期日（UTC 日期）
Maximum concurrent users|最大同时在线用户数
Company enabled|启用公司
Save company settings|保存公司设置
Client administrator|客户管理员
Set up the first administrator for a new client, or invite an existing POS administrator. They can then manage their company's users.|为新客户设置首位管理员，或邀请现有 POS 管理员，之后他们可管理公司用户。
Administrator name|管理员姓名
Create first administrator and invite|创建首位管理员并邀请
POS administrator|POS 管理员
Invite administrator|邀请管理员
No available Admin or SuperAdmin operator is configured in this POS database.|此 POS 数据库尚未配置可用的 Admin 或 SuperAdmin 操作员。
Private invitation link|专属邀请链接
Shown once. Share directly with the intended administrator; it expires after 48 hours.|仅显示一次。请直接分享给指定管理员，链接将在 48 小时后失效。
Company users|公司用户
NEW CLIENT|新客户
Add a company|添加公司
Create a dedicated POS database or use a connection already configured on the server. SQL credentials are never entered or shown here.|创建专属 POS 数据库，或使用服务器上已配置的连接。此处不输入或显示 SQL 凭据。
Database setup|数据库设置
Create a new dedicated database|创建新的专属数据库
Use a configured connection|使用已配置的连接
New database creation needs a separately approved server provisioning account.|创建新数据库需要另行授权的服务器配置账户。
Dedicated database connection|专属数据库连接
Create company|创建公司
Accept invitation · SoftPOS|接受邀请 · SoftPOS
Accept invitation|接受邀请
New to SoftPOS? Choose a password of at least 12 characters. If this email already signs in to another SoftPOS company, use that same current password.|首次使用 SoftPOS？请设置至少 12 个字符的密码。如该邮箱已用于其他 SoftPOS 公司，请使用现有密码。
Password for this email|此邮箱的密码
Confirm password|确认密码
Activate email sign-in|启用邮箱登录
Account activated.|账户已激活。
Sign in to SoftPOS|登录 SoftPOS
Reset password · SoftPOS|重置密码 · SoftPOS
Reset password|重置密码
Choose a new password of at least 12 characters. Existing sessions will end.|请设置至少 12 个字符的新密码。现有登录将失效。
Set new password|设置新密码
Password changed.|密码已修改。
Item|商品
Qty|数量
Unit price|单价
Details|详情
Edit details|编辑详情
Add service description|添加服务说明
Searching…|搜索中…
Search unavailable. Type to try again.|搜索暂不可用，请重新输入以重试。
Calculating…|计算中…
New passwords do not match.|两次输入的新密码不一致。
The passwords do not match.|两次输入的密码不一致。
Choose a different new password.|请选择不同于当前密码的新密码。
Password changed. Sign in using your new password.|密码已修改，请使用新密码登录。
Your session has ended. Please sign in again.|登录已过期，请重新登录。
This link is missing or invalid. Ask your administrator for a new link.|链接缺失或无效，请联系管理员获取新链接。
The service is unavailable.|服务暂不可用。
Search products|搜索商品
Search products (F2)|搜索商品（F2）
Type name, code or barcode…|输入名称、编码或条码…
Enter Item Price|输入商品价格
Open account menu|打开账户菜单
Open account and menu|打开账户和菜单
Connection status and offline sales|连接状态与离线销售
SoftPOS modules|SoftPOS 功能模块
Product display options|商品显示选项
Product display|商品显示方式
Switch product layout|切换商品布局
Enter a product price|输入商品价格
Item price (FJD)|商品价格（斐济元）
Item price keypad|商品价格键盘
Delete last digit|删除最后一位
Double zero|两个零
Use price for next product|将价格用于下一个商品
Quick item prices|快捷商品价格
Product categories|商品分类
Use product retail price|使用商品零售价
Sale cart|购物车
Hold sale|销售挂单
Resume sale|恢复销售
Clear all cart items|清除全部购物车商品
Clear items|清除商品
Close menu|关闭菜单
Close installation|关闭安装窗口
Close change password|关闭修改密码窗口
Name or company code|名称或公司代码
Client management|客户管理
Save|保存
Edit|编辑
Delete|删除
Remove|移除
Enabled|已启用
Disabled|已停用
Active|启用
Inactive|停用
All|全部
Change|找零
Balance|余额
Tendered|实收
Paid|已付款
`.trim().split('\n').map(line => {
    const split = line.indexOf('|');
    return [line.slice(0, split), line.slice(split + 1)];
  }));
  for (const [source, target] of Object.entries(window.DemoI18n || {})) if (!(source in translations)) translations[source] = target;
  Object.assign(translations, window.DemoI18nOverride || {});
  // Demo: one set of names for the same thing, in English too (the source text stays what the page contains).
  const enLabels = window.DemoLabelsEn || {};
  const enHas = text => Object.prototype.hasOwnProperty.call(enLabels, String(text ?? '').trim());
  const storageKey = 'softpos.language';
  let language = 'en';
  try { if (localStorage.getItem(storageKey) === 'zh-CN') language = 'zh-CN'; } catch {}
  const originals = new WeakMap();
  function t(value) {
    const text = String(value ?? '');
    if (language === 'en') { const label = text.trim(); return enHas(label) ? text.replace(label, enLabels[label]) : text; }
    const key = text.trim();
    let translated = translations[key];
    if (!translated) {
      if (/^\d+(?:\.\d+)? items?$/.test(key)) translated = key.replace(/ items?$/, ' 件商品');
      else if (/^\d+ products shown$/.test(key)) translated = key.replace(/ products shown$/, ' 个商品');
      else if (key.startsWith('Price: ')) translated = '价格：' + key.slice(7);
      else if (/^Credit card surcharge \([\d.]+%\)$/.test(key)) translated = key.replace('Credit card surcharge', '信用卡手续费');
      else if (key.startsWith('Charge to card: ')) translated = '银行卡扣款：' + key.slice(16);
      else if (key.endsWith(' amount') && translations[key.slice(0, -7)]) translated = translations[key.slice(0, -7)] + '金额';
      else for (const [pattern, replacement] of window.DemoI18nPatterns || []) { if (pattern.test(key)) { translated = key.replace(pattern, replacement); break; } }
    }
    return translated ? text.replace(key, translated) : text;
  }
  function renderValue(owner, key, current, write) {
    let values = originals.get(owner);
    if (!values) { values = new Map(); originals.set(owner, values); }
    let record = values.get(key);
    if (!record || current !== record.rendered) record = { source: current };
    record.rendered = t(record.source);
    values.set(key, record);
    if (current !== record.rendered) write(record.rendered);
  }
  function translateElement(element) {
    if (!element || element.nodeType !== 1) return;
    if (element.hasAttribute('data-i18n')) {
      for (const node of element.childNodes) {
        if (node.nodeType === 3) renderValue(node, 'text', node.nodeValue, value => { node.nodeValue = value; });
      }
    }
    if (element.hasAttribute('data-i18n-attrs')) {
      for (const name of element.getAttribute('data-i18n-attrs').split(' ')) {
        if (element.hasAttribute(name)) renderValue(element, name, element.getAttribute(name), value => element.setAttribute(name, value));
      }
    }
  }
  function translateTree(root) {
    if (root.nodeType === 1) translateElement(root);
    root.querySelectorAll?.('[data-i18n],[data-i18n-attrs]').forEach(translateElement);
  }
  // Demo extension: every piece of interface text that exactly matches a dictionary entry is translated, not only the
  // elements the vendor marked. Receipts, reports on paper and anything in a <pre> stay as printed.
  const REGION_SKIP = 'script,style,pre,textarea,.report-paper,[data-i18n-skip]';
  const REGION_ATTRS = ['title', 'placeholder', 'aria-label'];
  const exact = text => {
    const key = String(text ?? '').trim();
    return Object.prototype.hasOwnProperty.call(translations, key) || (window.DemoI18nPatterns || []).some(([pattern]) => pattern.test(key));
  };
  function regionNode(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(REGION_SKIP)) return;
    const record = originals.get(node)?.get('text');
    if (!record && (language === 'en' ? !enHas(node.nodeValue) : !exact(node.nodeValue))) return;
    renderValue(node, 'text', node.nodeValue, value => { node.nodeValue = value; });
  }
  function regionAttributes(element) {
    if (element.closest(REGION_SKIP)) return;
    for (const name of REGION_ATTRS) {
      if (!element.hasAttribute(name)) continue;
      const value = element.getAttribute(name), record = originals.get(element)?.get(name);
      if (!record && (language === 'en' ? !enHas(value) : !exact(value))) continue;
      renderValue(element, name, value, next => element.setAttribute(name, next));
    }
  }
  function translateRegion(root) {
    if (root.nodeType === 3) { regionNode(root); return; }
    if (root.nodeType !== 1 || root.closest(REGION_SKIP)) return;
    regionAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: node => node.nodeType === 1 && node.matches(REGION_SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 3) regionNode(node); else regionAttributes(node);
    }
  }
  function picker() {
    const label = document.createElement('label');
    label.className = 'language-picker';
    const caption = document.createElement('span'); caption.setAttribute('data-i18n', ''); caption.textContent = 'Language';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Language / 语言');
    select.dataset.languagePicker = '';
    for (const [value, title] of [['en', 'English'], ['zh-CN', '简体中文']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = title; option.lang = value; select.append(option);
    }
    select.value = language;
    select.addEventListener('change', () => setLanguage(select.value));
    label.append(caption, select);
    return label;
  }
  function setLanguage(value, persist = true) {
    language = value === 'zh-CN' ? 'zh-CN' : 'en';
    if (persist) { try { localStorage.setItem(storageKey, language); } catch {} }
    document.documentElement.lang = language;
    document.querySelectorAll('[data-language-picker]').forEach(select => { select.value = language; });
    translateTree(document);
    translateRegion(document.body);
    document.dispatchEvent(new CustomEvent('softpos:languagechange', { detail: { language } }));
  }
  function originalText(element) {
    return Array.from(element.childNodes, node => node.nodeType === 3
      ? originals.get(node)?.get('text')?.source ?? node.nodeValue
      : node.nodeType === 1 ? originalText(node) : '').join('');
  }
  window.SoftPOSLanguage = { t, setLanguage, originalText, get language() { return language; } };
  document.querySelectorAll('.login-card').forEach(form => {
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.after(picker());
    else form.append(picker());
  });
  document.querySelectorAll('.master-login-card').forEach(form => form.prepend(picker()));
  for (const selector of ['#desktopAccountMenu .account-menu-items', '#mobileMoreDialog .dialog-card', '.master-header-actions']) {
    document.querySelector(selector)?.append(picker());
  }
  // These nodes contain application-generated interface messages, never entity names.
  for (const id of ['loginUserLabel', 'toggleLoginPassword', 'productCount', 'cartHeading', 'mobileViewCart', 'mobileItemCount', 'mobilePriceBtn', 'mobileDisplayBtn', 'changePasswordStatus', 'toast', 'tokenError', 'loginError', 'offlineStateText', 'paymentCardCharge']) {
    document.getElementById(id)?.setAttribute('data-i18n', '');
  }
  setLanguage(language, false);
  const observer = new MutationObserver(records => {
    // Disconnect during our writes so translating cannot create an observer loop.
    observer.disconnect();
    for (const record of records) {
      if (record.type === 'characterData') { translateElement(record.target.parentElement); regionNode(record.target); }
      else {
        translateElement(record.target);
        if (record.type === 'attributes') regionAttributes(record.target);
        record.addedNodes?.forEach(node => { if (node.nodeType === 1) translateTree(node); translateRegion(node); });
      }
    }
    observe();
  });
  function observe() { observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] }); }
  observe();
  window.addEventListener('storage', event => { if (event.key === storageKey) setLanguage(event.newValue, false); });
})();
