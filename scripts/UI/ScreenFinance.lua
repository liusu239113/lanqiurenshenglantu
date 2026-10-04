-- ============================================================================
-- ScreenFinance — 经纪与财务
--
-- 玩法闭环：
--   钱的来源 → 赛季年薪（受球队档次影响）、代言合约、商业活动（周行动）
--   钱的出口 → 能力特训页的「自费特训」直接买属性点
--
-- 财务页展示人气、代言收入，并提供可选的广告合作奖励。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Transfer = require("Core.Transfer")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

local ScreenFinance = {}

local C = Config.COLORS

---@type fun(): Panel
local render_

--- 大数字资产格
---@param value string
---@param label string
---@param color RGBAColor|nil
---@return Panel
local function MoneyBox(value, label, color)
    return UI.Panel {
        flexGrow = 1,
        flexBasis = 0,
        flexDirection = "column",
        alignItems = "center",
        gap = 2,
        paddingVertical = 10,
        backgroundColor = C.bgCardLight,
        borderWidth = 2,
        borderColor = C.outline,
        children = {
            UI.Label {
                text = value,
                fontSize = 19,
                fontWeight = "bold",
                fontColor = color or C.textMain,
            },
            UI.Label {
                text = label,
                fontSize = 10,
                fontWeight = "bold",
                fontColor = C.textSub,
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 主构建函数
-- ---------------------------------------------------------------------------

--- 构建经纪与财务页
---@param onBack fun()
---@param onAttr fun()|nil 跳转到能力特训（钱的出口）
---@return Panel
function ScreenFinance.Build(onBack, onAttr)
    Audio.PlayBgm("daily")
    ---@type fun(): Panel
    local renderAndSet_

    render_ = function()
        local state = Career.state
        if not state then
            onBack()
            return UI.Panel { width = "100%", height = "100%" }
        end

        local salary = state.salary or 0
        local endorseIncome = Career.endorsementIncome()
        local seasonIncome = salary + endorseIncome
        local tier = state.teamTier or 1
        local cost = Config.ECONOMY.moneyPerAttrPoint
        local canAfford = (state.money or 0) >= cost

        -- ---- 资产总览 ----
        local overview = Common.Block("资 产 总 览", {
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                gap = 8,
                children = {
                    MoneyBox(string.format("%d", state.money or 0), "存款（万）", C.success),
                    MoneyBox(string.format("%d", salary), "年薪（万）"),
                    MoneyBox(string.format("%d", endorseIncome), "代言（万/季）", C.accent),
                },
            },
            UI.Divider { color = { 26, 22, 20, 40 } },
            Common.KV("每赛季固定进账", string.format("%d 万", seasonIncome), C.success),
            Common.KV("当前球队", string.format("%s（%s档）",
                state.team or "自由身", Transfer.tierName(tier)), C.textMain),
            Common.Sub(string.format(
                "年薪 = 基础薪水 × 球队档次倍率（当前 ×%.2f）。想涨薪，先换一支更好的球队。",
                Transfer.salaryMul(tier)), 11),
        }, { barColor = C.textMain })

        -- ---- 代言档位：让人气这一资源可见、可追求 ----
        local fame = state.fame or 0
        local gate = Career.endorseFameGate()
        local tiers = Config.ECONOMY.endorseTiers or {}
        local curTier = Career.endorseTierOf(fame)

        --- 下一档的人气门槛（已封顶则为 nil）
        local nextTier = tiers[curTier + 1]
        --- 本档区间起点
        local curBase = curTier > 0 and tiers[curTier].fame or gate
        local nextAt = nextTier and nextTier.fame or curBase

        -- 进度：当前档内的人气完成度
        local progress = 0
        if nextTier then
            local span = nextAt - curBase
            progress = span > 0 and ((fame - curBase) / span * 100) or 0
        else
            progress = 100   -- 已到顶档
        end
        if progress < 0 then progress = 0 end
        if progress > 100 then progress = 100 end

        --- 当前档位描述
        local tierText
        if curTier <= 0 then
            tierText = string.format("暂无代言（还差 %d 人气）", math.max(0, gate - fame))
        else
            tierText = string.format("第 %d 档 · %s", curTier,
                (tiers[curTier].brands or {})[1] or "品牌")
        end

        --- 下一档收益预览
        local nextText
        if nextTier then
            local nextPay = math.floor(nextTier.payBase + nextAt * Config.ECONOMY.endorsePayPerFame)
            nextText = string.format("下一档「%s」：%d 人气，约 %d 万/季",
                (nextTier.brands or {})[1] or "品牌", nextAt, nextPay)
        else
            nextText = "已签下顶级代言，人气仍在持续提升收入"
        end

        --- 当前代言年薪（含人气系数）
        local curPay = 0
        if curTier > 0 then
            curPay = math.floor(tiers[curTier].payBase + fame * Config.ECONOMY.endorsePayPerFame)
        end

        local endorse = Common.Block("代 言 与 人 气", {
            Common.KV("当前人气", string.format("%d", fame), C.accent),
            -- 注意：不能用 Common.StatBar——它是 flexGrow=1/flexBasis=0 的横向并排组件，
            -- 单独放进纵向 Block 会塌成 0 高、文字与进度条重叠。这里用纵向自适应版本。
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 4,
                children = {
                    UI.Panel {
                        width = "100%",
                        flexDirection = "row",
                        justifyContent = "space-between",
                        children = {
                            UI.Label { text = "档位进度", fontSize = 11, fontWeight = "bold", fontColor = C.textSub },
                            UI.Label {
                                text = string.format("%d%%", math.floor(progress)),
                                fontSize = 13, fontWeight = "bold", fontColor = C.accent,
                            },
                        },
                    },
                    UI.ProgressBar {
                        value = progress,
                        max = 100,
                        height = 9,
                        showLabel = false,
                        fillColor = C.accent,
                    },
                },
            },
            Common.KV("代言档位", tierText, curTier > 0 and C.success or C.textSub),
            curTier > 0
                and Common.KV("当前代言年薪", string.format("%d 万/季", curPay), C.success)
                or Common.Panel { width = 0, height = 0 },
            Common.Sub(nextText, 11),
            Common.Sub("人气越高，能签的品牌越大、每赛季进账越多。比赛、商业活动、剧情事件都会涨人气。", 11),
        }, { barColor = C.accent })

        -- ---- 钱的出口 ----
        local spend = Common.Block("这 笔 钱 能 做 什 么", {
            Common.KV("自费特训（1 点属性点）", string.format("%d 万", cost),
                canAfford and C.success or C.danger),
            Common.Sub("不想等训练，就自己掏钱请私教。这是花钱换实力的直路。", 11),
            UI.Button {
                text = canAfford
                    and string.format("去请私教（现有 %d 万）", state.money or 0)
                    or string.format("资金不足（需 %d 万）", cost),
                width = "100%",
                height = 46,
                fontSize = 14,
                fontWeight = "bold",
                backgroundColor = canAfford and C.success or { 226, 218, 204, 255 },
                textColor = canAfford and { 255, 255, 255, 255 } or { 150, 140, 126, 255 },
                hoverBackgroundColor = { 82, 188, 108, 255 },
                pressedBackgroundColor = { 44, 138, 68, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                disabled = not canAfford,
                onClick = function()
                    Audio.Play("click")
                    if onAttr then onAttr() end
                end,
            },
        }, { barColor = C.secondary })

        local opportunities = Common.Block("经 纪 人 的 新 机 会", {
            Common.Sub("可选激励视频：看完领取明确收益；错过广告也不影响签约、比赛和赛季收入。", 11),
            AdWidgets.Button(state, "press", function()
                Career.addFame(Config.AD_REWARDS.pressFame)
                return string.format("媒体采访传开了，人气 +%d", Config.AD_REWARDS.pressFame)
            end, { label = string.format("▶ 看广告 · 媒体采访，人气 +%d", Config.AD_REWARDS.pressFame),
                onFinished = function() renderAndSet_() end }),
            AdWidgets.Button(state, "lottery", function()
                Career.addMoney(Config.AD_REWARDS.lotteryMoney)
                return string.format("签下商业推广，存款 +%d 万", Config.AD_REWARDS.lotteryMoney)
            end, { label = string.format("▶ 看广告 · 商业推广，存款 +%d 万", Config.AD_REWARDS.lotteryMoney),
                onFinished = function() renderAndSet_() end }),
        }, { barColor = C.accent })

        return Common.Screen(Config.ART.bgFinanceRoom, {
            Common.TopBar("经 纪 与 财 务", function()
                Audio.Play("click")
                onBack()
            end),

            UI.ScrollView {
                flexGrow = 1,
                flexBasis = 0,
                scrollY = true,
                showScrollbar = true,
                children = {
                    UI.Panel {
                        width = "100%",
                        flexDirection = "column",
                        gap = 14,
                        padding = 16,
                        paddingBottom = 28,
                        children = {
                            Common.Sub("合同、代言、奖金——经纪人替你算得明明白白。", 13),
                            overview,
                            endorse,
                            spend,
                            opportunities,
                        },
                    },
                },
            },
        }, { dim = 0.5 })
    end

    renderAndSet_ = function()
        local screen = render_()
        UI.SetRoot(screen)
        return screen
    end

    return renderAndSet_()
end

return ScreenFinance
