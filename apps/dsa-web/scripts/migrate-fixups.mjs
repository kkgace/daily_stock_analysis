#!/usr/bin/env node
/** 修正 vi.mock/vi.importActual 内的相对模块 id（按迁移前位置解析），并迁移 api/__tests__ 到各 feature。 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '../src')
const APPLY = process.argv.includes('--apply')

// newRel -> oldRel（与迁移脚本 MAP 相反方向，仅取文件级；目录映射反向展开太重，这里直接按映射表做相对解析基准）
const REV = {
  'app/App.tsx': 'App.tsx',
  'app/App.test.tsx': 'App.test.tsx',
  'features/auth/pages/LoginPage.tsx': 'pages/LoginPage.tsx',
  'features/auth/pages/__tests__/LoginPage.test.tsx': 'pages/__tests__/LoginPage.test.tsx',
  'features/auth/contexts/AuthContext.tsx': 'contexts/AuthContext.tsx',
  'features/auth/contexts/__tests__/AuthContext.test.tsx': 'contexts/__tests__/AuthContext.test.tsx',
  'features/dashboard/pages/HomePage.tsx': 'pages/HomePage.tsx',
  'features/dashboard/pages/__tests__/HomePage.test.tsx': 'pages/__tests__/HomePage.test.tsx',
  'features/dashboard/hooks/__tests__/useDashboardLifecycle.test.tsx': 'hooks/__tests__/useDashboardLifecycle.test.tsx',
  'features/dashboard/hooks/__tests__/useRunFlowSnapshot.test.tsx': 'hooks/__tests__/useRunFlowSnapshot.test.tsx',
  'features/dashboard/hooks/__tests__/useTaskStream.test.tsx': 'hooks/__tests__/useTaskStream.test.tsx',
  'features/dashboard/hooks/__tests__/useWatchlist.test.tsx': 'hooks/__tests__/useWatchlist.test.tsx',
  'features/screening/pages/__tests__/StockScreeningPage.test.tsx': 'pages/__tests__/StockScreeningPage.test.tsx',
  'features/chat/pages/__tests__/ChatPage.test.tsx': 'pages/__tests__/ChatPage.test.tsx',
  'features/chat/stores/__tests__/agentChatStore.test.ts': 'stores/__tests__/agentChatStore.test.ts',
  'features/decision-signals/pages/__tests__/DecisionSignalsPage.test.tsx': 'pages/__tests__/DecisionSignalsPage.test.tsx',
  'features/portfolio/pages/__tests__/PortfolioPage.test.tsx': 'pages/__tests__/PortfolioPage.test.tsx',
  'features/portfolio/stores/__tests__/stockPoolStore.test.ts': 'stores/__tests__/stockPoolStore.test.ts',
  'features/backtest/pages/__tests__/BacktestPage.test.tsx': 'pages/__tests__/BacktestPage.test.tsx',
  'features/alerts/pages/__tests__/AlertsPage.test.tsx': 'pages/__tests__/AlertsPage.test.tsx',
  'features/settings/pages/__tests__/SettingsPage.test.tsx': 'pages/__tests__/SettingsPage.test.tsx',
  'features/token-usage/pages/__tests__/TokenUsagePage.test.tsx': 'pages/__tests__/TokenUsagePage.test.tsx',
}
const DIR_REV = [
  ['features/dashboard/components/', 'components/'],
  ['features/decision-signals/components/', 'components/'],
  ['features/alerts/components/', 'components/'],
  ['features/settings/components/', 'components/'],
]
const FWD_DIRS = [
  ['components/dashboard', 'features/dashboard/components/dashboard'],
  ['components/history', 'features/dashboard/components/history'],
  ['components/market-review', 'features/dashboard/components/market-review'],
  ['components/report', 'features/dashboard/components/report'],
  ['components/run-flow', 'features/dashboard/components/run-flow'],
  ['components/tasks', 'features/dashboard/components/tasks'],
  ['components/watchlist', 'features/dashboard/components/watchlist'],
  ['components/decision-signals', 'features/decision-signals/components/decision-signals'],
  ['components/alerts', 'features/alerts/components/alerts'],
  ['components/settings', 'features/settings/components/settings'],
  ['components/common', 'components/ui'],
  ['pages/HomePage.tsx', 'features/dashboard/pages/HomePage.tsx'],
  ['pages/StockScreeningPage.tsx', 'features/screening/pages/StockScreeningPage.tsx'],
  ['pages/ChatPage.tsx', 'features/chat/pages/ChatPage.tsx'],
  ['pages/DecisionSignalsPage.tsx', 'features/decision-signals/pages/DecisionSignalsPage.tsx'],
  ['pages/PortfolioPage.tsx', 'features/portfolio/pages/PortfolioPage.tsx'],
  ['pages/BacktestPage.tsx', 'features/backtest/pages/BacktestPage.tsx'],
  ['pages/AlertsPage.tsx', 'features/alerts/pages/AlertsPage.tsx'],
  ['pages/SettingsPage.tsx', 'features/settings/pages/SettingsPage.tsx'],
  ['pages/TokenUsagePage.tsx', 'features/token-usage/pages/TokenUsagePage.tsx'],
  ['pages/LoginPage.tsx', 'features/auth/pages/LoginPage.tsx'],
  ['api/alerts.ts', 'features/alerts/api/alerts.ts'],
  ['api/analysis.ts', 'features/dashboard/api/analysis.ts'],
  ['api/auth.ts', 'features/auth/api/auth.ts'],
  ['api/backtest.ts', 'features/backtest/api/backtest.ts'],
  ['api/data.ts', 'features/settings/api/data.ts'],
  ['api/decisionSignals.ts', 'features/decision-signals/api/decisionSignals.ts'],
  ['api/history.ts', 'features/dashboard/api/history.ts'],
  ['api/portfolio.ts', 'features/portfolio/api/portfolio.ts'],
  ['api/screening.ts', 'features/screening/api/screening.ts'],
  ['api/stocks.ts', 'features/settings/api/stocks.ts'],
  ['api/systemConfig.ts', 'features/settings/api/systemConfig.ts'],
  ['api/usage.ts', 'features/token-usage/api/usage.ts'],
  ['stores/analysisStore.ts', 'features/dashboard/stores/analysisStore.ts'],
  ['stores/agentChatStore.ts', 'features/chat/stores/agentChatStore.ts'],
  ['stores/stockPoolStore.ts', 'features/portfolio/stores/stockPoolStore.ts'],
  ['hooks/useDashboardLifecycle.ts', 'features/dashboard/hooks/useDashboardLifecycle.ts'],
  ['hooks/useHomeDashboardState.ts', 'features/dashboard/hooks/useHomeDashboardState.ts'],
  ['hooks/useTaskStream.ts', 'features/dashboard/hooks/useTaskStream.ts'],
  ['hooks/useRunFlowSnapshot.ts', 'features/dashboard/hooks/useRunFlowSnapshot.ts'],
  ['hooks/useWatchlist.ts', 'features/dashboard/hooks/useWatchlist.ts'],
  ['hooks/useAuth.ts', 'features/auth/hooks/useAuth.ts'],
  ['contexts/AuthContext.tsx', 'features/auth/contexts/AuthContext.tsx'],
  ['types/alerts.ts', 'features/alerts/types/alerts.ts'],
  ['types/backtest.ts', 'features/backtest/types/backtest.ts'],
  ['types/decisionSignals.ts', 'features/decision-signals/types/decisionSignals.ts'],
  ['types/portfolio.ts', 'features/portfolio/types/portfolio.ts'],
  ['types/systemConfig.ts', 'features/settings/types/systemConfig.ts'],
  ['utils/chatExport.ts', 'features/chat/utils/chatExport.ts'],
  ['utils/chatFollowUp.ts', 'features/chat/utils/chatFollowUp.ts'],
  ['utils/chatScroll.ts', 'features/chat/utils/chatScroll.ts'],
  ['utils/chatStockCode.ts', 'features/chat/utils/chatStockCode.ts'],
  ['utils/decisionSignalLabels.ts', 'features/decision-signals/utils/decisionSignalLabels.ts'],
  ['utils/decisionSignalProfile.ts', 'features/decision-signals/utils/decisionSignalProfile.ts'],
  ['utils/decisionSignalTime.ts', 'features/decision-signals/utils/decisionSignalTime.ts'],
  ['utils/decisionSignalTimeline.ts', 'features/decision-signals/utils/decisionSignalTimeline.ts'],
  ['utils/portfolioFormat.ts', 'features/portfolio/utils/portfolioFormat.ts'],
  ['utils/systemConfigI18n.ts', 'features/settings/utils/systemConfigI18n.ts'],
  ['locales/settingsHelp.ts', 'features/settings/locales/settingsHelp.ts'],
]
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.d.ts']

function oldRelFor(newRel) {
  if (REV[newRel]) return REV[newRel]
  for (const [newP, oldP] of DIR_REV) if (newRel.startsWith(newP)) return oldP + newRel.slice(newP.length)
  return null
}
function forward(oldRel) {
  for (const [o, n] of FWD_DIRS.sort((a, b) => b[0].length - a[0].length)) {
    if (oldRel === o || oldRel.startsWith(o + '/')) return n + oldRel.slice(o.length)
  }
  return oldRel
}
function resolveAgainst(dirRel, spec) {
  const base = path.posix.normalize(path.posix.join(dirRel, spec))
  const cands = [base, ...EXTS.map((x) => base + x), ...EXTS.map((x) => base + '/index' + x)]
  // 可能在迁移后的位置存在，也可能只在迁移前存在；两处都试
  return cands.map((c) => forward(c)).find((c) => existsSync(path.join(SRC, c)))
    ?? cands.find((c) => existsSync(path.join(SRC, c)))
    ?? null
}

function listFiles(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (statSync(p).isDirectory()) out.push(...listFiles(p))
    else out.push(p)
  }
  return out
}

const files = listFiles(SRC).filter((f) => /\.test\.(ts|tsx)$/.test(f))
let touched = 0
const skipped = []
for (const abs of files) {
  const newRel = path.relative(SRC, abs).split(path.sep).join('/')
  const oldRel = oldRelFor(newRel) ?? newRel
  const dirCandidates = [path.posix.dirname(oldRel), path.posix.dirname(newRel)]
  let content = readFileSync(abs, 'utf8')
  const next = content.replace(
    /(vi\.(?:mock|importActual)(?:<[^)]*>)?\(\s*|from\s*|import\s+['"])(['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (m, prefix, _q1, spec) => {
      for (const dirRel of dirCandidates) {
        const found = resolveAgainst(dirRel, spec)
        if (found) {
          const stripped = forward(found).replace(/\.(d\.ts|tsx?|jsx?)$/, '')
          return `${prefix}'@/${stripped}'`
        }
      }
      skipped.push(`${newRel}: ${spec}`)
      return m
    },
  )
  if (next !== content) {
    touched++
    if (APPLY) writeFileSync(abs, next)
  }
}

// 迁移 api/__tests__ 到各 feature（agent/error/utils 的测试留在共享 api）
const apiTestMap = {
  'api/__tests__/analysis.test.ts': 'features/dashboard/api/__tests__/analysis.test.ts',
  'api/__tests__/alerts.test.ts': 'features/alerts/api/__tests__/alerts.test.ts',
  'api/__tests__/backtest.test.ts': 'features/backtest/api/__tests__/backtest.test.ts',
  'api/__tests__/data.test.ts': 'features/settings/api/__tests__/data.test.ts',
  'api/__tests__/decisionSignals.test.ts': 'features/decision-signals/api/__tests__/decisionSignals.test.ts',
  'api/__tests__/screening.test.ts': 'features/screening/api/__tests__/screening.test.ts',
  'api/__tests__/systemConfig.test.ts': 'features/settings/api/__tests__/systemConfig.test.ts',
  'api/__tests__/usage.test.ts': 'features/token-usage/api/__tests__/usage.test.ts',
}
console.log(`fixups touched: ${touched}, unresolved: ${skipped.length}`)
skipped.slice(0, 30).forEach((s) => console.log('SKIP', s))
if (!APPLY) process.exit(0)
for (const [o, n] of Object.entries(apiTestMap)) {
  const src = path.join(SRC, o)
  if (!existsSync(src)) { console.log('missing', o); continue }
  const dest = path.join(SRC, n)
  mkdirSync(path.dirname(dest), { recursive: true })
  writeFileSync(dest, readFileSync(src))
  rmSync(src)
  console.log(`moved ${o} -> ${n}`)
}
console.log('done')
