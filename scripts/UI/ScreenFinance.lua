-- ============================================================================
-- ScreenFinance — 经纪与财务
--
-- 玩法闭环：
--   钱的来源 → 赛季年薪（受球队档次影响）、代言合约、商业活动（周行动）
--   钱的出口 → 能力特训页的「自费特训」直接买属性点
--   广告路径 → 全页唯一的广告按钮「刮一张彩票」，拿到一笔意外之财
--
-- 广告只是捷径：不打广告照样能靠年薪 / 代言 / 商业活动攒钱，只是慢。
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

    render_ = function()
        local state = Career.state
        if not state then
            onBack()
            return UI.Panel { width = "100%", height = "100%" }
        end

        --- 重建本页（彩票到账后刷新数值）
        local function refresh()
            renderAndSet_()
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

        -- ---- 钱的出口 ----
        local spend = Common.Block("这 笔 钱 能 做 什 么", {
            Common.KV("自费特训（1 点属性点）", string.format("%d 万", cost),
                canAfford and C.success or C.danger),
            Common.Sub("不想等训练，就自己掏钱请私教。这是花钱换实力的直路。", 11),
            UI.Button {
                text = canAfford
                    and string.format("🏋 去请私教（现有 %d 万）", state.money or 0)
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

        -- ---- 广告路径：彩票（全页唯一广告位）----
        local lottery = Common.Block("彩 票", {
            AdWidgets.AdTag("经纪人从口袋里掏出一张彩票：「这张，我压它。」"),
            AdWidgets.Button(state, "lottery", function()
                local lo = Config.AD_REWARDS.lotteryMin
                local hi = Config.AD_REWARDS.lotteryMax
                local prize = math.random(lo, hi)
                Career.addMoney(prize)
                Career.save()
                return string.format("中奖！奖金 +%d 万", prize)
            end, { height = 52, fontSize = 15, onFinished = refresh }),
        }, { barColor = { 232, 168, 32, 255 } })

        return Common.Screen(Config.ART.bgLocker, {
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
                            spend,
                            lottery,
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
