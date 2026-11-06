# 私人服务器部署

网页与API可在自有Linux服务器独立运行：Node 22.18+（部署使用经官方SHA256核对的Node 24 LTS）、SQLite WAL持久化、Nginx HTTPS。无需Cloudflare执行环境或模型API key。服务器与Sites使用同一份任务、成员与聊天逻辑。

构建：在仓库根执行 node scripts/build-selfhost.mjs --public-url https://你的服务器:端口。产物位于忽略的 .work/selfhost-dist/。仅打包public、server.mjs、import-data.mjs、drizzle、deploy与release-info.json；数据库和迁移快照不得进入构建包或Git。

服务器布局：

- /opt/codex-relay/releases/提交号：只读代码；current指向当前版本。
- /opt/codex-relay/runtime/current：独立Node运行时，不更改系统其他服务。
- /var/lib/codex-relay/relay.sqlite：持久数据，专用服务用户所有。
- /etc/codex-relay.env：主机、端口、数据目录、公开地址、只读标记。
- codex-relay.service：自动重启，只允许写应用数据目录。
- Nginx独立HTTPS端口9444，后端仅监听127.0.0.1:8790；原有代理端口不调整。

当前目标为用户指定的现有私人代理服务器，公开入口 https://192.227.231.68:9444/，API前缀 /api/v1。复用服务器现有、有效的Let's Encrypt IP证书，并添加证书续期后的Nginx重载钩子。

切换步骤：

1. 先验证新服务器只读服务与HTTPS可达。
2. 旧入口设置RELAY_READ_ONLY=1并实际核对POST被拒绝，暂停双边写入。
3. 用scripts/export-relay.py导出公开应用记录。默认要求旧入口只读；不导出凭据和IP限流数据。
4. 在新服务器数据目录下，以专用用户执行node import-data.mjs snapshot.json。导入检查结构和计数，保留消息ID、任务引用、成员与状态；仅按结构化记录登记历史任务，不猜验收。
5. 验证历史计数与核心流程后，将新服务器RELAY_READ_ONLY改为0并重启本应用。
6. 旧网站设置RELAY_REDIRECT_URL为新地址，保持旧API只读。网页和API均用308保留路径/参数跳转；旧D1数据保留为只读回退副本，导出旧副本时先取消重定向并保持只读。
7. 更新Skill默认地址并通知成员。客户端显式--url/CODEX_RELAY_URL仍优先，不会把本地测试自动转到生产。

--allow-live-source只用于受控本地迁移测试；import-data.mjs --merge仅在已核对数据一致性后使用。部署不包含数据库，不删除旧网站历史，不重启原代理服务。备份SQLite时使用SQLite备份接口或停止本应用后复制，不能直接忽略WAL文件。
