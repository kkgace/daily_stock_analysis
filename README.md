<div align="center">

# 📈 股票智能分析系统（DSA）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)

> 🤖 基于 AI 大模型的 A股 / 港股 / 美股 / 日股 / 韩股 / 台股自选股智能分析系统，
> 每日自动分析并推送「决策仪表盘」到企业微信 / 飞书 / Telegram / Discord / Slack / 邮箱。
> 本仓库基于 [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) 二次开发，
> 在上游基础上新增**数据质量护栏**与**决策信号后验闭环**两条能力线。

[**产品预览**](#-产品预览) · [**功能特性**](#-功能特性) · [**本仓库增强**](#-本仓库增强) · [**快速开始**](#-快速开始) · [**推送效果**](#-推送效果) · [**文档中心**](docs/INDEX.md) · [**完整指南**](docs/full-guide.md)

</div>

## 🖥️ 产品预览

<p align="center">
  <img src="docs/assets/readme_workspace_tour_20260510.gif" alt="DSA Web 工作台演示" width="720">
</p>

## ✨ 功能特性

| 能力 | 覆盖内容 |
|------|------|
| AI 决策报告 | 核心结论、评分、趋势、买卖点位、风险警报、催化因素、操作检查清单 |
| 多市场数据聚合 | A股、港股、美股、日股、韩股、台股和 ETF 的行情、K 线、技术指标、新闻、公告与基本面；各市场数据源能力边界见 [市场支持边界](docs/market-support.md) |
| Web / 桌面工作台 | 手动分析、任务进度、历史报告、完整 Markdown、回测、持仓、配置管理、浅色 / 深色主题 |
| Agent 策略问股 | 多轮追问，内置均线、缠论、波浪、趋势、热点、事件、成长、预期等 15 种策略，覆盖 Web / Bot / API |
| 智能导入与补全 | 图片、CSV/Excel、剪贴板导入；股票代码 / 名称 / 拼音 / 别名补全 |
| 自动化与推送 | GitHub Actions、Docker、本地定时任务、FastAPI 服务和企业微信 / 飞书 / Telegram / Discord / Slack / 邮件推送 |

> 功能细节、字段契约、交易纪律、数据源优先级与 Web/API 行为见 [完整配置与部署指南](docs/full-guide.md)。

### 技术栈与数据来源

| 类型 | 支持 |
|------|------|
| AI 模型 | Anspire、AIHubMix、Gemini、OpenAI 兼容（DeepSeek / 通义千问等）、Claude、Ollama 本地模型 |
| 行情数据 | AkShare、Baostock、YFinance、Tushare、Pytdx、TickFlow、Longbridge、腾讯备用源 |
| 新闻搜索 | Anspire、SerpApi、Tavily、博查、Brave、MiniMax、SearXNG 自建实例 |
| 社交舆情 | Stock Sentiment API（Reddit / X / Polymarket，仅美股，可选） |

> 默认内置 AkShare、Baostock、YFinance 等免费行情源，可零配置运行；免费源受上游限流与接口变动影响，长期定时 / 批量分析建议配置 token 型数据源，适用市场与 fallback 规则见 [数据源配置](docs/full-guide.md#数据源配置)。

## 🛡️ 本仓库增强

相对上游新增 / 修复的核心能力（均可通过配置开关或只读接口观测）：

| 能力 | 说明 | 文档 |
|------|------|------|
| 数据入库质量护栏 | 日线落库前运行量纲交叉校验（amount vs volume×close）、近 10 根 K 线中位数突变检测与跨源同日一致性检查，异常记录到 `stock_data_anomalies` 台账，**只记录不阻断**；已修复记录被坏数据源重写时自动回开，`DATA_QUALITY_GUARD_ENABLED=false` 可关闭 | [数据源稳定性护栏](docs/data-source-stability.md) |
| 扫描与修复 CLI | `python main.py --data-quality` 只读扫描存量数据量纲错误与源切换边界突变，`--data-quality-apply` 应用**双门槛置信修复**（量纲比值 ≈100 倍量级 + 与近 10 根量中位数同量级），幂等补标、台账补录，vwap 闪崩日等正常极端偏差只报告不误修 | 同上 |
| 腾讯科创板量纲修复 | 腾讯日线对科创板（688）返回「股」、其余板块返回「手」，上游统一 ×100 导致科创板 volume 偏大 100 倍（Issue #2350 源头）；本仓库按板块区分换算，并用同响应内 amount/close 中位数证据**运行时自校验**，线上行为与文档不符也不会写坏数据 | 同上 |
| 决策信号后验闭环 | 每只股票的「建议回测」卡片展示近 N 天信号命中 / 未中 / 中性、命中率与分动作统计（`REPORT_SIGNAL_TRACK_DAYS`，默认 30，0 关闭），通知、单股推送、分享图海报与 Web 报告四条渲染路径共用同一 formatter；统计**按信号去重**（多周期评估取信号声明周期） | [决策信号与后验](docs/decision-signals.md) |
| 只读统计 API | `GET /api/v1/decision-signals/outcomes/stats/{stock_code}` 单股后验统计、`GET /api/v1/data/anomalies` 数据质量异常分页列表与状态汇总，静态 OpenAPI 已同步 | [API 规范](docs/architecture/api_spec.json) |
| Web 数据质量面板 | 设置页数据源分类新增「数据质量异常」面板：状态计数徽章、severity 优先排序、筛选与明细表、截断提示，空态区分"无待处理"与"筛选无结果" | [数据源稳定性护栏](docs/data-source-stability.md) |
| 数据质量系统告警 | 分析收尾把本轮新发现的日线异常经 `NOTIFICATION_SYSTEM_ERROR_CHANNELS` 路由聚合推送（`DATA_QUALITY_NOTIFY_ENABLED` 默认开启）；批量与单股入口均有 try/finally 崩溃兜底，降噪 key 带批次日期 + kind 维度，全量计数防 500 条截断降级，进程退出前有界等待告警线程 | 同上 |

## 🚀 快速开始

### 方式一：GitHub Actions（推荐）

> 5 分钟完成部署，零成本，无需服务器。

#### 1. Fork 本仓库

点击右上角 `Fork` 按钮。

#### 2. 配置 Secrets

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

**AI 模型（至少一个）**：`ANSPIRE_API_KEYS` / `AIHUBMIX_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`（兼容 DeepSeek、通义千问等，配 `OPENAI_BASE_URL` + `OPENAI_MODEL`）。多模型、图片识别、本地模型与高级路由见 [LLM 配置指南](docs/LLM_CONFIG_GUIDE.md)。

**通知渠道（至少一个）**：`WECHAT_WEBHOOK_URL`（企业微信）/ `FEISHU_WEBHOOK_URL`（飞书）/ `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` / `DISCORD_WEBHOOK_URL` / `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` / `EMAIL_SENDER` + `EMAIL_PASSWORD`。

**自选股（必填）**：`STOCK_LIST`，如 `600519,hk00700,AAPL,7203.T,005930.KS,2330.TW`；已登记指数显式代码（如 `sh000016`）经 `--stocks` 或 Actions 入口支持，规则见 [指数自选股配置](docs/full-guide.md#指数自选股配置)。

**新闻源（推荐）**：`ANSPIRE_API_KEYS` / `SERPAPI_API_KEYS` / `TAVILY_API_KEYS` / `BOCHA_API_KEYS` / `BRAVE_API_KEYS` / `MINIMAX_API_KEYS` / `SEARXNG_BASE_URLS`，详见 [搜索服务配置](docs/full-guide.md#搜索服务配置)。

**行情数据源（可选）**：`TUSHARE_TOKEN`（A 股）、`LONGBRIDGE_OAUTH_CLIENT_ID` + `LONGBRIDGE_OAUTH_TOKEN_CACHE_B64`（港美股补齐量比 / 换手率 / PE），详见 [数据源配置](docs/full-guide.md#数据源配置)。

#### 3. 启用并手动测试

`Actions` 标签启用工作流 → `每日股票分析` → `Run workflow`。默认工作日 18:00（北京时间）自动执行，非交易日默认跳过；强制运行与断点续传规则见 [完整指南](docs/full-guide.md#定时任务配置)。

### 方式二：本地运行 / Docker

```bash
# 克隆项目
git clone https://github.com/kkgace/daily_stock_analysis.git && cd daily_stock_analysis

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env && vim .env

# 运行分析
python main.py
```

常用命令：

```bash
python main.py --debug                          # 调试模式
python main.py --dry-run                        # 仅抓取数据，不分析
python main.py --stocks 600519,hk00700,AAPL     # 指定自选股
python main.py --market-review                  # 仅大盘复盘
python main.py --schedule                       # 本地定时任务
python main.py --webui / --serve                # Web / FastAPI 服务

# 数据质量扫描与修复（本仓库新增）
python main.py --data-quality                    # 只读扫描近 90 天存量数据
python main.py --data-quality --data-quality-apply   # 应用高置信量纲修复
python main.py --data-quality --data-quality-code 688111 --data-quality-days 30
```

> Docker 部署与云服务器访问见 [完整指南](docs/full-guide.md)；桌面客户端打包见 [桌面端打包说明](docs/desktop-package.md)。

## 📱 推送效果

### 决策仪表盘（含「建议回测」卡片）

```
🎯 2026-02-08 决策仪表盘
共分析3只股票 | 🟢买入:0 🟡观望:2 🔴卖出:1

📊 分析结果摘要
⚪ 中钨高新(000657): 观望 | 评分 65 | 看多
⚪ 永鼎股份(600105): 观望 | 评分 48 | 震荡
🟡 新莱应材(300260): 卖出 | 评分 35 | 看空

🧠 建议回测 (600105 · 近30天)
近 30 天评估 12 条建议信号：命中 7 · 未中 3 · 中性 2
总体命中率: 70.0%
分动作统计: 买入 命中 4/5 · 持有 命中 2/3 · 卖出 命中 1/4
...
```

### 数据质量护栏告警（本仓库新增）

```
⚠️ 数据质量护栏告警
本轮新发现 3 条日线数据异常（涉及 2 只股票）
**量纲可疑**（严重）：1 条 — 688111
**源切换跳变**（警告）：2 条 — 600519
护栏只记录不阻断入库；运行 python main.py --data-quality 查看报告，
确认后可用 --data-quality-apply 应用高置信量纲修复。
```

### 大盘复盘

```
🎯 2026-01-10 大盘复盘

📊 主要指数
- 上证指数: 3250.12 (🟢+0.85%)
- 深证成指: 10521.36 (🟢+1.02%)
- 创业板指: 2156.78 (🟢+1.35%)

📈 市场概况
上涨: 3920 | 下跌: 1349 | 涨停: 155 | 跌停: 3

🔥 板块表现
领涨: 互联网服务、文化传媒、小金属
领跌: 保险、航空机场、光伏设备
```

## ⚙️ 主要入口

| 入口 | 说明 |
|------|------|
| `main.py` | 分析任务主入口（CLI / 定时 / 服务 / 数据质量扫描） |
| `server.py` | FastAPI 服务入口（`uvicorn server:app`） |
| `apps/dsa-web/` | Web 前端（`npm ci && npm run build`） |
| `apps/dsa-desktop/` | Electron 桌面端 |
| `.github/workflows/` | CI 与每日分析工作流 |
| `docs/INDEX.md` | 文档中心索引 |

## 🧭 文档导航

- [完整配置与部署指南](docs/full-guide.md) — 环境变量、模型渠道、通知渠道、数据源、定时任务、Web/API
- [数据源稳定性护栏](docs/data-source-stability.md) — 质量护栏、扫描修复 CLI、科创板量纲修复、异常告警
- [决策信号与后验](docs/decision-signals.md) — 信号提取、outcome 评估、建议回测卡片与统计口径
- [LLM 配置指南](docs/LLM_CONFIG_GUIDE.md) · [市场支持边界](docs/market-support.md) · [桌面端打包](docs/desktop-package.md)
- [API 规范](docs/architecture/api_spec.json) · [变更日志](docs/CHANGELOG.md)

## 🙏 上游与致谢

本仓库基于 [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis)（MIT License）二次开发，感谢上游作者的开放与持续维护。上游相关的选股参考项目 [AlphaSift](https://github.com/ZhuLinsen/alphasift) 与策略验证项目 [AlphaEvo](https://github.com/ZhuLinsen/alphaevo) 亦可关注。

二次开发与功能增强以本仓库 [Issues](https://github.com/kkgace/daily_stock_analysis/issues) 为准。

## 📄 License

[MIT License](LICENSE) © ZhuLinsen，二次开发部分遵循同一 MIT 许可。

## ⚠️ 免责声明

本项目仅供学习和研究使用，不构成任何投资建议。股市有风险，投资需谨慎。使用本项目产生的任何损失由使用者自行承担。
