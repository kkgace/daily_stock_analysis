# -*- coding: utf-8 -*-
"""单股分享图海报的「建议回测」卡片渲染回归（P1）。

卡片不在 StockPoster 的结构化提取字段里：此前只要命中任一结构化字段
（真实报告必有 score/conclusion），fallback 全文被丢弃，单股海报永远
丢卡（通知文本有卡、转出的 PNG 没有卡）。这里锁定两条修复路径：
1. ``_stock_data`` 从报告 Markdown 整段提取卡片小节到 ``track_record``；
2. ``_stock_body`` 在结构化渲染模式下单独补渲染卡片，非结构化路径
   （fallback 已含全文）不重复渲染。
"""

from __future__ import annotations

from datetime import date

from src.share_image import StockPoster, _full_section, _stock_body, _stock_data

TRACK_CARD_MD = (
    "### 📈 建议回测（近30天）\n"
    "\n"
    "**后验表现**: 命中 3 · 未中 1 · 中性 0 — **命中率 75.0%**\n"
    "**分动作**: 买入 3 条（命中 3）\n"
    "*命中率 = 命中 /（命中 + 未中），中性与无法评估的信号不计入分母。*\n"
)


def test_stock_data_extracts_track_record_section() -> None:
    markdown_text = (
        "# 个股分析: 600519 贵州茅台\n"
        "\n"
        "### 🧠 核心结论\n"
        "\n"
        "**一句话决策**: 突破平台，买入\n"
        "\n"
        f"{TRACK_CARD_MD}"
        "\n"
        "### 📰 消息面\n"
        "\n"
        "无重大新闻。\n"
    )
    poster = _stock_data(markdown_text, generated_on=date(2026, 9, 25))
    assert poster.track_record.startswith("### 📈 建议回测")
    assert "命中率" in poster.track_record
    # 整段提取到下一个同级标题为止，不吞并后续小节
    assert "消息面" not in poster.track_record


def test_stock_data_track_record_empty_without_card() -> None:
    poster = _stock_data(
        "# 个股分析: 600519\n\n### 🧠 核心结论\n\n**一句话决策**: 持有\n",
        generated_on=date(2026, 9, 25),
    )
    assert poster.track_record == ""


def test_stock_body_renders_track_card_in_structured_mode() -> None:
    poster = StockPoster(title="个股分析", language="zh", conclusion="一句话决策")
    poster.track_record = TRACK_CARD_MD

    html = _stock_body(poster, "<p>fallback 全文</p>")

    # 结构化字段存在（conclusion）→ fallback 被丢弃，但卡片必须单独渲染
    assert "建议回测" in html
    assert "命中率" in html
    assert "fallback 全文" not in html


def test_stock_body_keeps_card_via_fallback_without_structured_fields() -> None:
    poster = StockPoster(title="个股分析", language="zh")
    poster.track_record = TRACK_CARD_MD

    html = _stock_body(poster, f"<p>fallback 全文</p>{TRACK_CARD_MD}")

    # 无结构化字段 → 走 fallback 全文（内含卡片），且卡片不重复渲染
    assert html.count("建议回测（近30天）") == 1


def test_full_section_matches_english_and_korean_headings() -> None:
    assert "Signal Track Record" in _full_section(
        "### 📈 Signal Track Record (30d)\n\n**Outcomes**: hit 3\n",
        "建议回测",
        "Signal Track Record",
        "시그널 트랙",
    )
    assert "시그널 트랙 레코드" in _full_section(
        "### 📈 시그널 트랙 레코드 (30일)\n\n**후검 결과**: 적중 3\n",
        "建议回测",
        "Signal Track Record",
        "시그널 트랙",
    )
