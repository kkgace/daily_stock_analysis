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
