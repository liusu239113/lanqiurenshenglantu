-- ============================================================================
-- ScreenWelfare — 球队福利社
--
-- 玩法闭环：
--   原生路径 → 每周免费领一份补给（经验 + 士气），到点自动刷新
--   广告路径 → 全页唯一的广告按钮「找队长多领一份」，本周再多拿一份
--
-- 广告只是捷径：不领广告照样每周有补给，只是少一份。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

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

        --- 重建本页（领取后刷新状态）
        local function refresh()
            renderAndSet()
        end

        -- ---- 本周补给 ----
        ---@type table[]
        local supplyChildren = {
            UI.Label {
                text = string.format("球队每周给球员发一次补给：经验 +%d、士气 +%d。",
                    exp, morale),
                fontSize = 12,
                fontColor = C.textSub,
                whiteSpace = "normal",
                lineHeight = 1.5,
            },
        }

        if available then
            table.insert(supplyChildren, UI.Button {
                text = "领 取 本 周 补 给",
                width = "100%",
                height = 50,
                fontSize = 15,
                fontWeight = "bold",
                backgroundColor = C.success,
                textColor = { 255, 255, 255, 255 },
                hoverBackgroundColor = { 82, 188, 108, 255 },
                pressedBackgroundColor = { 44, 138, 68, 255 },
                borderWidth = 3,
                borderColor = C.outline,
                letterSpacing = 2,
                onClick = function()
                    Audio.Play("click")
                    local msg = Career.claimWelfare()
                    if msg then
                        Career.save()
                        Audio.Play("levelup")
                        UI.Toast.Show(msg, { duration = 2.5, variant = "success", position = "bottom" })
                    end
                    refresh()
                end,
            })
        else
            table.insert(supplyChildren, UI.Panel {
                width = "100%",
                padding = 12,
                backgroundColor = { 232, 246, 232, 255 },
                borderWidth = 2,
                borderColor = C.outline,
                children = {
                    UI.Label {
                        text = "✓ 本周补给已领，下一周再来",
                        fontSize = 13,
                        fontWeight = "bold",
                        fontColor = C.success,
                        textAlign = "center",
                        whiteSpace = "normal",
                    },
                },
            })
        end

        -- ---- 全页唯一的广告位 ----
        local adBlock = Common.Block("队 长 那 边", {
            AdWidgets.AdTag("队长管着多出来的那份补给，跟他聊聊就有。"),
            AdWidgets.Button(state, "welfare", function()
                return Career.grantExtraWelfare()
            end, { height = 50, fontSize = 14, onFinished = refresh }),
        }, { barColor = { 232, 168, 32, 255 } })

        local root = Common.Screen(Config.ART.bgLocker, {
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
                            Common.Sub("设施、伙食、康复——球队给的，别不好意思拿。", 13),
                            Common.Block("本 周 补 给", supplyChildren, { barColor = C.success }),
                            adBlock,
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
        local screen = render()
        UI.SetRoot(screen)
        return screen
    end

    return renderAndSet()
end

return ScreenWelfare
