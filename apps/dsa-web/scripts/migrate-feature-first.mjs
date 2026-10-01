#!/usr/bin/env node
/**
 * 一次性迁移脚本：apps/dsa-web 结构改为 feature-first。
 * 1) 按 MAP 移动文件/目录；2) 把全部相对imports重写为 '@/...' 别名。
 * 用法：node scripts/migrate-feature-first.mjs --apply   （不带 --apply 为 dry-run）
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '../src')
const APPLY = process.argv.includes('--apply')

// old path (relative to src) -> new path. 目录映射用前缀匹配。
const MAP = {
  'App.tsx': 'app/App.tsx',
  'App.test.tsx': 'app/App.test.tsx',
  'components/common': 'components/ui',
  // auth
  'pages/LoginPage.tsx': 'features/auth/pages/LoginPage.tsx',
  'contexts/AuthContext.tsx': 'features/auth/contexts/AuthContext.tsx',
  'api/auth.ts': 'features/auth/api/auth.ts',
  'hooks/useAuth.ts': 'features/auth/hooks/useAuth.ts',
  // dashboard
  'pages/HomePage.tsx': 'features/dashboard/pages/HomePage.tsx',
  'components/dashboard': 'features/dashboard/components/dashboard',
  'components/history': 'features/dashboard/components/history',
  'components/market-review': 'features/dashboard/components/market-review',
  'components/report': 'features/dashboard/components/report',
  'components/run-flow': 'features/dashboard/components/run-flow',
  'components/tasks': 'features/dashboard/components/tasks',
  'components/watchlist': 'features/dashboard/components/watchlist',
  'api/analysis.ts': 'features/dashboard/api/analysis.ts',
  'api/history.ts': 'features/dashboard/api/history.ts',
  'hooks/useDashboardLifecycle.ts': 'features/dashboard/hooks/useDashboardLifecycle.ts',
  'hooks/useHomeDashboardState.ts': 'features/dashboard/hooks/useHomeDashboardState.ts',
  'hooks/useTaskStream.ts': 'features/dashboard/hooks/useTaskStream.ts',
  'hooks/useRunFlowSnapshot.ts': 'features/dashboard/hooks/useRunFlowSnapshot.ts',
  'hooks/useWatchlist.ts': 'features/dashboard/hooks/useWatchlist.ts',
  'stores/analysisStore.ts': 'features/dashboard/stores/analysisStore.ts',
  // screening
  'pages/StockScreeningPage.tsx': 'features/screening/pages/StockScreeningPage.tsx',
  'api/screening.ts': 'features/screening/api/screening.ts',
  // chat
  'pages/ChatPage.tsx': 'features/chat/pages/ChatPage.tsx',
  'stores/agentChatStore.ts': 'features/chat/stores/agentChatStore.ts',
  'utils/chatExport.ts': 'features/chat/utils/chatExport.ts',
  'utils/chatFollowUp.ts': 'features/chat/utils/chatFollowUp.ts',
  'utils/chatScroll.ts': 'features/chat/utils/chatScroll.ts',
  'utils/chatStockCode.ts': 'features/chat/utils/chatStockCode.ts',
  // decision-signals
  'pages/DecisionSignalsPage.tsx': 'features/decision-signals/pages/DecisionSignalsPage.tsx',
  'components/decision-signals': 'features/decision-signals/components/decision-signals',
  'api/decisionSignals.ts': 'features/decision-signals/api/decisionSignals.ts',
  'types/decisionSignals.ts': 'features/decision-signals/types/decisionSignals.ts',
  'utils/decisionSignalLabels.ts': 'features/decision-signals/utils/decisionSignalLabels.ts',
  'utils/decisionSignalProfile.ts': 'features/decision-signals/utils/decisionSignalProfile.ts',
  'utils/decisionSignalTime.ts': 'features/decision-signals/utils/decisionSignalTime.ts',
  'utils/decisionSignalTimeline.ts': 'features/decision-signals/utils/decisionSignalTimeline.ts',
  // portfolio
  'pages/PortfolioPage.tsx': 'features/portfolio/pages/PortfolioPage.tsx',
  'api/portfolio.ts': 'features/portfolio/api/portfolio.ts',
  'types/portfolio.ts': 'features/portfolio/types/portfolio.ts',
  'utils/portfolioFormat.ts': 'features/portfolio/utils/portfolioFormat.ts',
  'stores/stockPoolStore.ts': 'features/portfolio/stores/stockPoolStore.ts',
  // backtest
  'pages/BacktestPage.tsx': 'features/backtest/pages/BacktestPage.tsx',
  'api/backtest.ts': 'features/backtest/api/backtest.ts',
  'types/backtest.ts': 'features/backtest/types/backtest.ts',
  // alerts
  'pages/AlertsPage.tsx': 'features/alerts/pages/AlertsPage.tsx',
  'components/alerts': 'features/alerts/components/alerts',
  'api/alerts.ts': 'features/alerts/api/alerts.ts',
  'types/alerts.ts': 'features/alerts/types/alerts.ts',
  // settings
  'pages/SettingsPage.tsx': 'features/settings/pages/SettingsPage.tsx',
  'components/settings': 'features/settings/components/settings',
  'api/systemConfig.ts': 'features/settings/api/systemConfig.ts',
  'api/data.ts': 'features/settings/api/data.ts',
  'api/stocks.ts': 'features/settings/api/stocks.ts',
  'types/systemConfig.ts': 'features/settings/types/systemConfig.ts',
  'utils/systemConfigI18n.ts': 'features/settings/utils/systemConfigI18n.ts',
  'locales/settingsHelp.ts': 'features/settings/locales/settingsHelp.ts',
  'locales/settingsHelp.test.ts': 'features/settings/locales/settingsHelp.test.ts',
  // token-usage
  'pages/TokenUsagePage.tsx': 'features/token-usage/pages/TokenUsagePage.tsx',
  'api/usage.ts': 'features/token-usage/api/usage.ts',
  // shared charts etc stay. pages leftovers next:
  'pages/NotFoundPage.tsx': 'app/pages/NotFoundPage.tsx',
  // page tests follow their pages
  'pages/__tests__/LoginPage.test.tsx': 'features/auth/pages/__tests__/LoginPage.test.tsx',
  'pages/__tests__/HomePage.test.tsx': 'features/dashboard/pages/__tests__/HomePage.test.tsx',
  'pages/__tests__/StockScreeningPage.test.tsx': 'features/screening/pages/__tests__/StockScreeningPage.test.tsx',
  'pages/__tests__/ChatPage.test.tsx': 'features/chat/pages/__tests__/ChatPage.test.tsx',
  'pages/__tests__/DecisionSignalsPage.test.tsx': 'features/decision-signals/pages/__tests__/DecisionSignalsPage.test.tsx',
  'pages/__tests__/PortfolioPage.test.tsx': 'features/portfolio/pages/__tests__/PortfolioPage.test.tsx',
  'pages/__tests__/BacktestPage.test.tsx': 'features/backtest/pages/__tests__/BacktestPage.test.tsx',
  'pages/__tests__/AlertsPage.test.tsx': 'features/alerts/pages/__tests__/AlertsPage.test.tsx',
  'pages/__tests__/SettingsPage.test.tsx': 'features/settings/pages/__tests__/SettingsPage.test.tsx',
  'pages/__tests__/TokenUsagePage.test.tsx': 'features/token-usage/pages/__tests__/TokenUsagePage.test.tsx',
  // dashboard hook tests
  'hooks/__tests__/useDashboardLifecycle.test.tsx': 'features/dashboard/hooks/__tests__/useDashboardLifecycle.test.tsx',
  'hooks/__tests__/useRunFlowSnapshot.test.tsx': 'features/dashboard/hooks/__tests__/useRunFlowSnapshot.test.tsx',
  'hooks/__tests__/useTaskStream.test.tsx': 'features/dashboard/hooks/__tests__/useTaskStream.test.tsx',
  'hooks/__tests__/useWatchlist.test.tsx': 'features/dashboard/hooks/__tests__/useWatchlist.test.tsx',
  // store tests
  'stores/__tests__/stockPoolStore.test.ts': 'features/portfolio/stores/__tests__/stockPoolStore.test.ts',
  'stores/__tests__/agentChatStore.test.ts': 'features/chat/stores/__tests__/agentChatStore.test.ts',
  // auth context test / settings locale test already mapped
  'contexts/__tests__/AuthContext.test.tsx': 'features/auth/contexts/__tests__/AuthContext.test.tsx',
  // chat utils tests
  'utils/__tests__/chatFollowUp.test.ts': 'features/chat/utils/__tests__/chatFollowUp.test.ts',
  'utils/__tests__/chatScroll.test.ts': 'features/chat/utils/__tests__/chatScroll.test.ts',
  // decision-signal utils tests
  'utils/__tests__/decisionSignalLabels.test.ts': 'features/decision-signals/utils/__tests__/decisionSignalLabels.test.ts',
  'utils/__tests__/decisionSignalProfile.test.ts': 'features/decision-signals/utils/__tests__/decisionSignalProfile.test.ts',
  'utils/__tests__/decisionSignalTime.test.ts': 'features/decision-signals/utils/__tests__/decisionSignalTime.test.ts',
  // portfolio utils tests
  'utils/__tests__/portfolioFormat.test.ts': 'features/portfolio/utils/__tests__/portfolioFormat.test.ts',
}

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '.css', '.json']

function listFiles(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (statSync(p).isDirectory()) out.push(...listFiles(p))
    else out.push(p)
  }
  return out
}

// 构建 oldRel -> newRel 映射（目录展开到文件粒度）
const entries = Object.entries(MAP).sort((a, b) => b[0].length - a[0].length)
function resolveMove(rel) {
  for (const [oldP, newP] of entries) {
    if (rel === oldP || rel.startsWith(oldP + '/')) return newP + rel.slice(oldP.length)
  }
  return rel
}

function resolveSpecifierFile(importerRel, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), spec))
  const cands = [base, ...EXTS.map((x) => base + x), ...EXTS.map((x) => base + '/index' + x)]
  return cands.find((c) => existsSync(path.join(SRC, c))) ?? null
}

const files = listFiles(SRC).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
const planned = []
const failures = []

for (const abs of files) {
  const oldRel = path.relative(SRC, abs).split(path.sep).join('/')
  const newRel = resolveMove(oldRel)
  let content = readFileSync(abs, 'utf8')
  let changed = false
  const next = content.replace(
    /(from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g,
    (m, prefix, spec) => {
      const target = resolveSpecifierFile(oldRel, spec)
      if (!target) {
        // .css 或其他资产，也可能解析失败 —— 原样输出 @/ 形式
        const raw = path.posix.normalize(path.posix.join(path.posix.dirname(oldRel), spec))
        changed = true
        return `${prefix}'@/${resolveMove(raw)}'`
      }
      changed = true
      const stripped = resolveMove(target).replace(/\.(d\.ts|tsx?|jsx?)$/, '')
      return `${prefix}'@/${stripped}'`
    },
  )
  if (next !== content) changed = true
  if (oldRel !== newRel || (changed && next !== content)) {
    planned.push({ oldRel, newRel, content: next, moved: oldRel !== newRel })
  }
  if (oldRel !== newRel && !APPLY) continue
}

console.log(`planned writes: ${planned.length}, moves: ${planned.filter((p) => p.moved).length}`)
if (!APPLY) {
  planned.filter((p) => p.moved).slice(0, 400).forEach((p) => console.log(`${p.oldRel} -> ${p.newRel}`))
  process.exit(0)
}

// apply: write new locations first, then remove moved-out originals
const toRemove = []
for (const p of planned) {
  const dest = path.join(SRC, p.newRel)
  mkdirSync(path.dirname(dest), { recursive: true })
  writeFileSync(dest, p.content)
  if (p.moved) toRemove.push(path.join(SRC, p.oldRel))
}
for (const f of toRemove) rmSync(f, { force: true })
// 清理空目录（自底向上）
function pruneEmpty(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (statSync(p).isDirectory()) pruneEmpty(p)
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true })
}
pruneEmpty(SRC)
console.log(`applied. removed ${toRemove.length} originals, failures ${failures.length}`)
