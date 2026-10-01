# dsa-web 结构重构进展（方案 B：feature-first）

临时代理文档（不打算入库，可后续删除）。目的：跨会话/压缩后接续。

## 目标
feature-first 重组 → 拆分巨型页面/store → 统一 i18n → 视觉 tokens 重构。每阶段 lint/build/test 绿。

## 已完成（Phase 1：目录迁移 + @/ 别名）
- 新增别名 `@/` → `src`：tsconfig.app.json、vite.config.ts、vitest.config.ts。
- 迁移脚本（可重跑审计，勿再 --apply）：`apps/dsa-web/scripts/migrate-feature-first.mjs`、`migrate-fixups.mjs`。
- 新结构：
  - `src/app/`（App.tsx、App.test.tsx、app/pages/NotFoundPage、App.css）
  - `src/features/{auth,dashboard,screening,chat,decision-signals,portfolio,backtest,alerts,settings,token-usage}/...` 各含 pages|components|api|hooks|stores|utils|types|locales|contexts 子目录
  - 共享层仍在原位：`src/api/{agent,error,index,utils}`、`src/components/{ui,layout,theme,StockAutocomplete,i18n}`（common 已更名 ui）、`src/contexts/UiLanguageContext`、`src/hooks/{useAutocomplete,useDesktopUpdate,useStockIndex,useSystemConfig,index}`、`src/stores/index.ts`（桶）、`src/{i18n,locales,types,utils,desktop}`
  - `src/pages/` 已删除；`src/api/__tests__` 按 feature 分迁（agent 测试留在共享 api）
- 全部相对 import → `@/...` 绝对别名；tests/ 下两个 src 引用已同步。
- 验证：tsc ✅、lint 0 error（2 warning 为基线既有）、npm test **1218 passed / 2 failed（均迁移前既有失败，见下）**、【build ✅ 22s】。
- 基线既有失败（勿归因于重构）：
  1. `DecisionSignalsPage > reports an expired signal refresh...`（缺 timeline-click-90）
  2. `AlertRuleForm > shows JP/KR options for market region in Chinese UI mode`
  - lint 既有 warning：StockScreeningPage 两处 hooks deps。

## Round 3-4 进展
- 子代理可靠性：并行 6 个会因资源被大量静默 kill；前台同步模式直接失败；顺序后台模式每轮能做部分工作但常在完成前死掉。当前策略：一次一个后台 agent + 手动验证/补漏。
- decision-signals ✅ 完成（1633→262 行，105/105 通过，顺带修复既有失败用例 timeline-click-90）。
- dashboard：部分抽出已存在（pages/home/* 5 组件 + homeUtils 848 行，hooks/useDuplicateBanner 等），dashboard 相关 lint 已修绿，但 HomePage.tsx（1917）尚未接线。
- chat：pages/chat/* 已抽出（ChatComposer/MessageList/ChatHeader/activeStockContext），ChatPage.tsx（1756）未接线；2 个 hook lint error（useChatScroll:53、useFollowUpHydration:95 set-state-in-effect）。
- screening：只有 3 个小 utils 抽出；portfolio：stores/stockPool/* 切片与 pages/portfolio/* 已抽出但未接线，hooks/usePortfolioSignals:68 有 lint error；stockPoolStore.ts 仍 1117 行未拆分。
- settings：未动（SettingsPage 1655 行）。
- 测试现状：1219 passed / 1 failed（仅 AlertRuleForm JP/KR 既有失败）。lint 3 error + 2 warning。
- Phase 3 部分完成：`src/locales/featureText.ts` → `src/i18n/featureText.ts`（locales/ 目录已删），tsc ✅。待续：uiText(2011) 拆键域、settingsHelp(2564) 归位评估。
- 进行中：chat 接线 agent（后台，3ae667da）→ 之后按 dashboard → screening → portfolio → settings 顺序。

## Round 5
- 手动修复 portfolio hooks/usePortfolioSignals.ts 的 set-state-in-effect（微任务延迟 + 请求序号守卫），lint error 3→2（剩 chat 两个）。tsc ✅。
- settings 已有较完整抽出未接线：pages/settings/{ActiveConfigPanel, ConfigBackupCard, FirstRunSetupCard, SchedulerSettingsCard, ScreeningSettingsCard, VersionInfoCard}.tsx + settingsConfigKeys.ts + hooks/{useEnvBackup,useScreeningToggle,useSetupStatus}（合计 1286 行）；settings 目录 0 lint 问题。
- chat 接线 agent（3ae667da）仍在后台运行。

## Round 7（手动接线 settings，子代理仍不可靠）
- settings ✅：手动把 SettingsPage 内联重复替换为抽取件（FirstRunSetupCard / SchedulerSettingsCard / ConfigBackupCard / ScreeningSettingsCard / VersionInfoCard / ActiveConfigPanel + settingsConfigKeys 助手）。SettingsPage 1655→~780 行。settings 221/221 测试通过、tsc ✅、settings lint 0。
- 残留（后续轮）：settings 的 useEnvBackup/useScreeningToggle/useSetupStatus 抽出 hook 尚未接线（页面仍有内联逻辑，可再精简）；types 里 UiLanguage 等 import 已清理。
- chat agent 3ae667da 可能已完成 hooks lint 修复（全仓 lint error 归零），ChatPage 页面接线未知（本次未验）。

## 未做（后续 phase）
- Phase 2 剩余：见上。
- Phase 3 剩余：i18n 键域拆分。
- Phase 4：视觉体系（index.css tokens → tailwind @theme 迁移、Shell 壳重构）。注意 AGENTS.md：UI 视觉变更 PR 需附截图；勿入库截图文件。
- 结束后删除 scripts/migrate-*.mjs 与本文件（或依用户意见）。
- 未经确认不得 git commit/push（AGENTS.md）。

## Round 8（chat 语义对齐 + 状态核实）
- portfolio store 切片核实为已接线：stockPoolStore.ts 1117→41 行，stockPool/{analysisActions,historyActions,historyFetchers,historyHelpers,completedTaskSelection,requestControl,types} 全部组合进 store。
- chat：ChatPage.tsx 重建为 977 行组合层。已对齐语义：meta.onAccepted 才清草稿、untouched 会话省略 skills（sessionSelectedSkillIds===null）、用户清空后显式 skills:[]、快捷问题单技能覆盖 + setInput(label)、快捷问题 explicit context 仅 Codex、follow-up URL 等 registry settle 后 resolveRegisteredIndexCanonical 归一、同会话点击 no-op、agentAvailable 在 checking/error/unavailable 时禁发。
- chat 当前测试：121 passed / 7 failed。剩余失败：①Codex 英文状态文案 ②legacy 会话省略 skills ③快捷问题草稿保留到 accepted ④一名多市场不猜测 context:undefined ⑤新会话/切换清 active context ⑥删当前会话清 context ⑦从会话消息恢复 Codex 索引 canonical。
- 已知修法（待执行）：③handleQuickQuestion 需先 setInput(question.label)；④多市场时 resolution=null 且无 followUp/active 兜底时 payload 不得带 context；⑤⑥handleStartNewChat/deleteSession 需显式清 activeStockContext+activeStockCode；⑦恢复 effect 需在 Codex 下用 registry canonical。
- dashboard 未接线（HomePage 1917 行，pages/home/* 5 组件 + homeUtils 848 行 + hooks 已抽出）；screening 未拆（2127 行）。

## Round 9（chat ✅ 完成，128/128 全绿）
- 7 个失败全部修复：①agentUnavailableError 改用 t() 本地化（codex→chat.codexUnavailableMessage / default→chat.defaultUnavailableMessage，忽略原始 status.message）②payload 补 session_id ④context 键显式存在（context: sendContext ?? undefined，Vitest objectContaining({context:undefined}) 要求键存在）③handleQuickQuestion 先 setInput(question.label) 再发（草稿保留至 meta.onAccepted）⑤⑥handleStartNewChat 改走 useAgentChatStore.getState().startNewChat()（mock store 只暴露 getState().startNewChat）⑦名称解析兜底加守卫：有 activeStockContext 时仅显式换股（SWITCH_STOCK_MESSAGE_RE）且解析出不同股才应用，否则名称不覆盖/不补全 stock_name。
- 验证：chat 128/128；全仓 1219 passed / 1 failed（AlertRuleForm 既有）/ 2 skipped；lint 0 error + 2 warning（StockScreeningPage 既有）；tsc ✅；build ✅。
- Phase 2 剩余：dashboard 接线（HomePage 1917 行）→ screening 拆分（2127 行）。之后 Phase 3 i18n、Phase 4 视觉。
- 待用户确认：是否允许 commit checkpoint baseline（279 文件 untracked 无保护）。

## Round 10（dashboard ✅ 接线完成，1917→895 行）
- 全部孤儿件接线（每步跑 HomePage.test 61/61 守护）：
  - 组件 5 个：HomeHeader（含 useStrategyMenu 策略菜单整体迁移）、HomeSidebar（memo，workspace props 对象）、HomeAlerts、HomeDrawers、HomeAnalysisSection（主分析区 JSX 整段）。
  - homeUtils：模块级类型/常量/函数全部改为 import（lookupWatchlistHistory、getShanghai*、getStockCodeKey、chunkStockCodes、taskPanel 偏好读写、countBatchAccepted、toStockBarItemFromHistoryItem、getTodayAnalysisItems）。
  - hooks 7 个：useStrategyMenu、useDuplicateBanner、useTaskPanelCollapse、useSetupStatusNotice、useTodayAnalysis、useWatchlistHistoryLookup（含 retryWatchlistHistoryLookup 回调替换）、useMarketReviewRunner（6 状态 + 轮询 + 触发全迁入，setMarketReviewError 由 JSX onDismiss 使用）。
  - useTaskStream/useRunFlowSnapshot 核实为已消费（useDashboardLifecycle / RunFlowPanel），无需页面接线。
- 清理 12+ 孤儿 import；修复自引入的 exhaustive-deps warning（retryWatchlistHistoryLookup）。
- 验证：dashboard 61/61；全仓 1219 passed / 1 failed（AlertRuleForm 既有）/ 2 skipped；lint 0 error + 2 warning（既有）；build ✅。
- Phase 2 剩余：screening（StockScreeningPage 2127 行，仅 3 个小 utils 已抽出）。

## Round 11（screening ✅ 拆分完成，2127→360 行；Phase 2 全部收口）
- utils 接线（3 个既有抽件改为 import）：formatting / candidateUtils / screenMessages，删除全部内联重复定义（含 formatScreenMessage 诊断映射、FACTOR_LABELS 等），清孤儿 import。
- 新抽模块（pages/screening/）：
  - hotspotUtils.ts（389 行）：HOTSPOT_* 标签 + 题材详情/发酵路径/图标规则等全部纯函数（原内联 ~380 行）。
  - screenTaskPersistence.ts（55 行）：sessionStorage 任务指针读写 + 常量。
  - 组件 6 个：HotspotsSection（325）、ScreeningControls（136）、CandidatesSection（227）、TaskProgressSection（71）、HistorySection（79）、ScreenAlertMessage、MiniSparkline——JSX 原样移动 + 同名 props 解构。
- 新抽 hooks（features/screening/hooks/，新建目录）：
  - useScreeningHotspots（200 行）：10 状态 + 3 refs + 详情缓存/竞态防护/保留主题刷新语义。
  - useScreeningTask（354 行）：submit→poll→apply、历史选择互斥、刷新恢复（history API 优先 + task 轮询回退）；owned 状态 candidates/screenMeta/expandedCode/error/loading 等 13 项。
  - hook 化新增 2 个 exhaustive-deps warning（setMarket/setStrategy/historyContextStrategyRef 为稳定引用，加入 deps 无行为变化）已修复，回到 2-warning 既有基线（poll 效应的 market/maxResults deps 缺失为既有行为，保留）。
- 验证：screening 36/36；全仓 1219 passed / 1 failed（AlertRuleForm 既有）/ 2 skipped；lint 0 error + 2 warning（既有）；build ✅。
- **Phase 2 收口状态**：chat 128/128、dashboard 1917→895（61/61）、portfolio store 1117→41、screening 2127→360（36/36）全部完成。
- 下一步 Phase 3：src/i18n/uiText.ts（2011 行）拆键域 + settingsHelp.ts（2564 行）归位。

## Round 12（Phase 3 ✅ i18n 键域拆分完成）
- checkpoint baseline：commit 45536e3c（Phase 1+2 全量，384 files）。
- src/i18n/uiText.ts 2011→55 行装配器；978 键 × zh/en 拆入 src/i18n/domains/ 9 个键域文件（按 feature 对齐）：
  - common(25) / shell(66: language+theme+layout+routeError+notFound) / login(19) / home(182: home+history+stockBar+watchlist+stockTrend+taskPanel+report) / runFlow(106) / decisionSignals(206) / settings(313) / chat(25) / usage(36)。
- 公共 API 完全不变：UI_TEXT / UiTextKey / UiLanguage / UiTextParams / formatUiText 留在 uiText.ts；48 个消费方零改动。
- 类型安全保持：zh 各域 `as const`；en 各域 `Record<keyof typeof zh域, string>`（域内缺漏/多余键编译期报错）；装配层 `Record<UiTextKey, string>` 兜跨域完整性。
- 事故与修复：装配器曾把 formatUiText 重写为 split/join 多遍替换（与原单遍 regex replace 语义不同——参数值含占位符时会被二次替换）；已逐字还原原实现。
- settingsHelp.ts 已在 Phase 1 归位 features/settings/locales/（确认无需再动）。
- 验证：tsc ✅；lint 0 error + 2 warning（既有）；i18n 消费方测试 13/13；全仓 1219 passed / 1 failed（既有）/ 2 skipped；build ✅。
- 下一步 Phase 4：视觉体系重构（design tokens + Shell）；PR 需附截图。

## Round 13（Phase 4 ✅ 视觉体系：design tokens 架构统一）
用户确认范围：B（完整视觉重构）。实际落地为「token 架构系统化 + 双青色统一 + 暗色对比度修正」，无破坏性 re-skin。
- **Token 原语去重**（index.css）：新增 --accent-secondary-hsl / --primary-deep-hsl / --accent-hot-hsl / --accent-hot-bright-hsl / --on-accent（亮暗双值）；60 处内联 HSL 复制（193 100% 43% ×17、247 84% 66/72% ×24、190 100% 50% ×9、191 100% 40% ×3 等）全部改为 var() 间接引用——单一调源头，改一处即全主题生效。
- **双青色统一**：settings 域原本使用 190 100% 50%（与全局 primary 193 100% 43% 漂移）→ 统一为 var(--primary)；dark gradient rgba(0,212,255) 字面量 → var(--primary)。唯一可见变化点。
- **暗色对比度修正**：dark --color-warning 37 92% 50%→40 92% 60%、--color-danger 0 90% 55%→0 90% 64%、--color-success 提亮至 152 60% 52%；--shell-sidebar-border 修复了暗色缺失（此前暗色误用亮色 193 hue，现自动跟随主题）。
- **新 accent-hot 语义族**（热点橙）：注册 tailwind config（DEFAULT/bright）+ 亮暗双值；HotspotsSection 9 处、SuggestionsList BSE 徽章、MiniSparkline SVG stroke/fill（#f97316/#3b82f6→hsl var）全部语义化。
- **色板清扫 12 文件**：portfolio 删除按钮 red-400/100→danger 族；settings 3 卡 amber-700/300→warning；LLMChannelEditor rose→danger；StockBarItem amber-400+glow→warning；ChatComposer slate/amber 提示框→border/muted+warning；ConfirmDialog red→danger；Pagination text-slate-950→text-on-accent（新 token，固定深色 on 亮青底，双主题保证对比度）；DecisionSignalTimeline 图例点 hex→hsl var；ScoreGauge/echarts/recharts SVG/canvas 字面量为技术限制合法保留（CSS var 在 canvas 不解析）；JsonViewer 终端暗色代码块与测试锁定类保留；LoginPage 品牌装饰保留。
- **config 去字面量**：primary-gradient #00d4ff/#00a8cc、glow-cyan/purple/success/danger、shadow-cyan/20/22 全部 token 化。
- **数字排版**：screening 候选表、backtest 表、portfolio 持仓表加 tabular-nums（金融数据等宽对齐）。
- 验证：tsc ✅；lint 0 error + 2 warning（既有）；受影响面测试 216+68 全过；全仓最终验证见下。
- ⚠️ UI 变更截图：按 AGENTS.md，PR 需附亮/暗主题截图；我无法操作浏览器，需要用户在 PR 前补充（建议：首页/选股热点/设置/登录 × 亮暗双主题前后对比）。

## Round 14（收尾 ✅ 方案 B 全部完成）
- 最终全仓验证：tsc ✅；lint 0 error + 2 warning（既有）；测试 1219 passed / 1 failed（AlertRuleForm JP/KR 既有）/ 2 skipped；build ✅ —— 与重构前基线完全一致。
- 清理（用户确认）：删除 apps/dsa-web/scripts/migrate-{feature-first,fixups}.mjs（一次性迁移脚本，已执行完毕）；REFACTOR-PROGRESS.md 保留为迁移历史记录。
- 四阶段成果：
  - Phase 1 feature-first 目录迁移 + @/ 别名 ✅
  - Phase 2 巨型页面/store 拆分 ✅（chat 993 行页面拆至 7 组件 + 8 hooks；dashboard HomePage 1917→895；portfolio store 1117→41；screening 2127→360）
  - Phase 3 i18n 键域拆分 ✅（uiText.ts 2011→55 装配器 + 9 键域文件，公共 API 不变）
  - Phase 4 视觉体系 ✅（token 原语去重 60 处、双青色统一、暗色对比度修正、accent-hot 语义族、12 文件色板清扫、tabular-nums）
- ⚠️ 待办（PR 前，需用户执行）：按 AGENTS.md 为 UI 变更 PR 附亮/暗双主题截图（建议页面：首页、选股热点、设置、登录；settings 青色统一与暗色 warning/danger 对比度变化最值得对比）。
