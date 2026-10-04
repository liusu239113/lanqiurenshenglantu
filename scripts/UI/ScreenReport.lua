-- ============================================================================
-- ScreenReport — 赛后战报
--
-- 打完一场球之后的总结：比分、个人数据、高光、奖励。
-- 比赛基础收益仍由比赛结算发放；赛后复盘是玩家主动选择的额外广告奖励。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

local ScreenReport = {}

local C = Config.COLORS

--- 数据格子
---@param value string
---@param label string
---@param color RGBAColor|nil
---@return Panel
local function StatBox(value, label, color)
    return UI.Panel {
        flexGrow = 1,
        flexBasis = 0,
        flexDirection = "column",
        alignItems = "center",
        gap = 2,
        paddingVertical = 8,
        backgroundColor = C.bgCardLight,
        borderWidth = 2,
        borderColor = C.outline,
        children = {
            UI.Label {
                text = value,
                fontSize = 18,
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

--- 构建赛后战报
---@param result table 比赛结果（Match / MatchText 的 result）
---@param onClose fun()
---@return Panel
function ScreenReport.Build(result, onClose)
    Audio.PlayBgm("result")

    local state = Career.state
    local win = result.win == true
    local resultColor = win and C.success or C.danger

    local myPoints = result.myPoints or 0
    local oppPoints = result.oppPoints or 0
    local teamPoints = result.teamPoints or 0
    local rewardFame = result.rewardFame or 0
    local rewardMorale = result.rewardMorale or 0

    ---@type table[]
    local children = {
        -- 比分牌
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            alignItems = "center",
            gap = 12,
            children = {
                UI.Panel {
                    width = 56, height = 56, flexShrink = 0,
                    backgroundColor = resultColor,
                    borderWidth = 3,
                    borderColor = C.outline,
                    justifyContent = "center",
                    alignItems = "center",
                    children = {
                        UI.Label {
                            text = win and "胜" or "负",
                            fontSize = 28,
                            fontWeight = "bold",
                            fontColor = { 255, 255, 255, 255 },
                        },
                    },
                },
                UI.Panel {
                    flexGrow = 1,
                    flexShrink = 1,
                    flexBasis = 0,
                    flexDirection = "column",
                    gap = 4,
                    alignItems = "flex-start",
                    children = {
                        UI.Label {
                            text = result.summary or "",
                            fontSize = 13,
                            fontWeight = "bold",
                            fontColor = C.textMain,
                            whiteSpace = "normal",
                            lineHeight = 1.4,
                        },
                        UI.Label {
                            text = string.format("球队 %d : %d %s", teamPoints, oppPoints, result.opponent or ""),
                            fontSize = 12,
                            fontColor = C.textSub,
                            whiteSpace = "normal",
                        },
                    },
                },
            },
        },

        UI.Divider { color = { 26, 22, 20, 40 } },

        -- 个人数据
        UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 8,
            children = {
                StatBox(tostring(myPoints), "个人得分", C.primary),
            },
        },
    }

    -- 操作模式才有投篮 / 抢断统计
    local stats = result.stats
    if stats then
        table.insert(children, UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 8,
            children = {
                StatBox(string.format("%d/%d", stats.made or 0, stats.attempted or 0), "命中"),
                StatBox(tostring(stats.steals or 0), "防守成功"),
                StatBox(tostring(stats.turnovers or 0), "失误", C.danger),
            },
        })
    end

    -- 本场高光
    local highlights = result.highlights or {}
    if #highlights > 0 then
        ---@type table[]
        local hl = {}
        for i = 1, math.min(3, #highlights) do
            hl[i] = UI.Label {
                text = "★ " .. highlights[i],
                fontSize = 12,
                fontColor = C.textMain,
                whiteSpace = "normal",
                lineHeight = 1.5,
            }
        end
        table.insert(children, UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 6,
            padding = 10,
            backgroundColor = C.bgCardLight,
            borderWidth = 2,
            borderColor = C.outlineSoft,
            children = hl,
        })
    end

    -- 本场奖励
    ---@type string[]
    local rewardParts = {}
    if rewardFame > 0 then
        table.insert(rewardParts, string.format("人气 +%d", rewardFame))
    end
    if rewardMorale ~= 0 then
        table.insert(rewardParts, string.format("士气 %+d", rewardMorale))
    end
    table.insert(children, UI.Panel {
        width = "100%",
        padding = 10,
        backgroundColor = C.bgCardLight,
        borderWidth = 2,
        borderColor = C.outline,
        children = {
            UI.Label {
                text = #rewardParts > 0 and table.concat(rewardParts, "   ") or "本场无额外收益",
                fontSize = 13,
                fontWeight = "bold",
                fontColor = C.primary,
                textAlign = "center",
                whiteSpace = "normal",
            },
        },
    })

    local reviewDone = result.reviewAdDone == true
    if not reviewDone then
        table.insert(children, AdWidgets.Button(state, "review", function()
            result.reviewAdDone = true
            Career.addExp(Config.AD_REWARDS.reviewExp)
            return string.format("教练复盘完成：经验 +%d", Config.AD_REWARDS.reviewExp)
        end, {
            label = string.format("▶ 看广告 · 赛后复盘，经验 +%d", Config.AD_REWARDS.reviewExp),
            onFinished = function()
                UI.SetRoot(ScreenReport.Build(result, onClose))
            end,
        }))
    end

    table.insert(children, Common.PrimaryButton("继 续", function()
        Audio.Play("click")
        onClose()
    end))

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            Common.Bar("赛 后 战 报", resultColor),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 12,
                padding = 16,
                children = children,
            },
        },
    }

    return UI.Panel {
        width = "100%",
        height = "100%",
        flexDirection = "row",
        justifyContent = "center",
        alignItems = "center",
        backgroundColor = { 26, 22, 20, 210 },
        children = {
            UI.Panel {
                width = "100%",
                maxWidth = Common.CONTENT_MAX_W,
                maxHeight = "92%",
                paddingHorizontal = 16,
                children = {
                    UI.ScrollView {
                        flexGrow = 1,
                        flexBasis = 0,
                        scrollY = true,
                        showScrollbar = true,
                        children = { card },
                    },
                },
            },
        },
    }
end

return ScreenReport
