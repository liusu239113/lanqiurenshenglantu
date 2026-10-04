-- ============================================================================
-- ScreenWelfare — 球队福利社
--
-- 球队补给每周一次；玩家主动选择观看激励视频后领取。
-- 不领取也能继续训练、比赛和推进生涯。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")
local Ads = require("Core.Ads")

local ScreenWelfare = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 主构建函数
-- ---------------------------------------------------------------------------

--- 构建球队福利页
---@param onBack fun()
---@return Panel
function ScreenWelfare.Build(onBack)
    Audio.PlayBgm("daily")

    ---@type fun(): Panel
    local render
    --- 渲染并设为当前根
    ---@type fun(): Panel
    local renderAndSet

    render = function()
        local state = Career.state
        if not state then
            onBack()
            return UI.Panel { width = "100%", height = "100%" }
        end

        local exp = Config.ECONOMY.welfareExp
        local morale = Config.ECONOMY.welfareMorale
        local available = Career.welfareAvailable()
        local adLeft = Ads.left(state, "welfare")

        --- 重建本页（领取后刷新状态）
        local function refresh()
            renderAndSet()
        end

        -- ---- 本周补给 ----
        ---@type table[]
        local supplyChildren = {
            UI.Label {
                text = string.format("球队每周提供一次补给，完整观看广告后领取：经验 +%d、士气 +%d。",
                    exp, morale),
                fontSize = 12,
                fontColor = C.textSub,
                whiteSpace = "normal",
                lineHeight = 1.5,
            },
        }

        if available and adLeft > 0 then
            table.insert(supplyChildren, AdWidgets.Button(state, "welfare", function()
                return Career.claimWelfare() or "本周补给已领取"
            end, {
                label = string.format("▶ 看广告领取本周补给 · 经验 +%d / 士气 +%d", exp, morale),
                height = 54, onFinished = refresh,
            }))
        else
            table.insert(supplyChildren, UI.Panel {
                width = "100%",
                padding = 12,
                backgroundColor = { 232, 246, 232, 255 },
                borderWidth = 2,
                borderColor = C.outline,
                children = {
                    UI.Label {
                        text = available and "本赛季广告补给已用完" or "√ 本周补给已领，下一周再来",
                        fontSize = 13,
                        fontWeight = "bold",
                        fontColor = available and C.textSub or C.success,
                        textAlign = "center",
                        whiteSpace = "normal",
                    },
                },
            })
        end

        local root = Common.Screen(Config.ART.bgWelfareRoom, {
            Common.TopBar("球 队 福 利", function()
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
                            Common.Sub("球场设施、伙食与康复资源都在这里；额外补给需主动观看广告。", 13),
                            Common.Block("本 周 补 给", supplyChildren, { barColor = C.success }),
                            state.stamina < 100 and Common.Block("体 能 师 恢 复 室", {
                                Common.Sub("临近比赛体力不足？你可以在这里主动选择快速恢复。", 11),
                                AdWidgets.Button(state, "boost", function()
                                    local before = math.floor(state.stamina)
                                    Career.addStamina(Config.AD_REWARDS.boostStamina)
                                    return string.format("体力 %d → %d", before, math.floor(state.stamina))
                                end, {
                                    label = string.format("▶ 看广告 · 体力恢复至最多 %d（当前 %d）",
                                        math.min(100, math.floor(state.stamina + Config.AD_REWARDS.boostStamina)),
                                        math.floor(state.stamina)),
                                    onFinished = refresh,
                                }),
                            }, { barColor = C.secondary }) or Common.Sub("当前体力已满，无需看广告恢复。", 11),
                            Common.Block("后 勤 说 明", {
                                Common.Sub("补给每周刷新一次；训练与比赛获得的经验可以在能力特训页换成属性点。", 11),
                            }, { barColor = C.textMain }),
                        },
                    },
                },
            },
        }, { dim = 0.5 })
        UI.SetRoot(root)
        return root
    end

    renderAndSet = function()
        return render()
    end

    return renderAndSet()
end

return ScreenWelfare
