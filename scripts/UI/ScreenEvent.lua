-- ============================================================================
-- ScreenEvent — 剧情事件卡界面（热血漫画分镜风）
-- 全屏覆盖：插图 + 标题条 + 正文 + 选项
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

local ScreenEvent = {}

local C = Config.COLORS

--- 构建事件卡
---@param ev table 事件数据
---@param playerName string
---@param onChoose fun(optionIndex: number)
---@return Panel
function ScreenEvent.Build(ev, playerName, onChoose)
    -- 正文里的 %s 替换为球员名
    local bodyText = ev.body or ""
    if bodyText:find("%s") then
        bodyText = string.format(bodyText, playerName)
    end

    -- 选项按钮
    ---@type table[]
    local optionButtons = {}
    for i = 1, #(ev.options or {}) do
        local opt = ev.options[i]
        local idx = i
        optionButtons[i] = UI.Button {
            text = opt.text,
            width = "100%",
            height = 54,
            fontSize = 15,
            fontWeight = "bold",
            backgroundColor = C.bgCardLight,
            textColor = C.textMain,
            hoverBackgroundColor = C.primary,
            pressedBackgroundColor = C.primaryDark,
            borderWidth = 3,
            borderColor = C.outline,
            onClick = function()
                Audio.Play("click")
                onChoose(idx)
            end,
        }
    end

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            -- 插图
            UI.Panel {
                width = "100%",
                height = 180,
                backgroundImage = ev.art or Config.ART.bgTraining,
                backgroundFit = "cover",
                borderBottomWidth = 3,
                borderBottomColor = C.outline,
            },

            -- 标题条（橙红底白字）
            UI.Panel {
                width = "100%",
                paddingHorizontal = 14,
                paddingVertical = 9,
                backgroundColor = C.primary,
                borderBottomWidth = 3,
                borderBottomColor = C.outline,
                children = {
                    UI.Label {
                        text = ev.title or "事件",
                        fontSize = 19,
                        fontWeight = "bold",
                        fontColor = { 255, 255, 255, 255 },
                        letterSpacing = 2,
                        whiteSpace = "normal",
                    },
                },
            },

            -- 正文 + 选项
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 12,
                padding = 16,
                children = {
                    UI.Label {
                        text = bodyText,
                        fontSize = 14,
                        fontColor = C.textMain,
                        whiteSpace = "normal",
                        lineHeight = 1.7,
                    },
                    UI.Panel {
                        flexDirection = "column",
                        gap = 10,
                        marginTop = 2,
                        children = optionButtons,
                    },
                },
            },
        },
    }

    return UI.Panel {
        width = "100%",
        height = "100%",
        flexDirection = "row",
        justifyContent = "center",
        alignItems = "center",
        backgroundColor = { 26, 22, 20, 200 },
        children = {
            UI.Panel {
                width = "100%",
                maxWidth = Common.CONTENT_MAX_W,
                paddingHorizontal = 16,
                children = { card },
            },
        },
    }
end

--- 构建选项结果反馈卡
---@param title string
---@param response string
---@param parts string[]
---@param onClose fun()
---@param onPress fun(): string|nil 看广告把这件事捅给媒体（返回提示文案），nil 则不显示该入口
---@return Panel
function ScreenEvent.BuildResult(title, response, parts, onClose, onPress)
    ---@type table[]
    local fxChildren = {}
    for i = 1, #parts do
        fxChildren[i] = Common.Tag(parts[i], C.secondary)
    end

    local card = UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            Common.Bar(title, C.success),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 14,
                padding = 18,
                children = {
                    UI.Label {
                        text = response,
                        fontSize = 14,
                        fontColor = C.textMain,
                        whiteSpace = "normal",
                        lineHeight = 1.7,
                    },
                    #fxChildren > 0 and UI.Panel {
                        flexDirection = "row",
                        flexWrap = "wrap",
                        gap = 8,
                        children = fxChildren,
                    } or UI.Panel { height = 0 },
                    -- 本页唯一的广告位：把事件热度变现成人气
                    onPress and AdWidgets.Button(Career.state, "press", onPress,
                        { height = 48, fontSize = 14 }) or UI.Panel { height = 0 },
                    Common.PrimaryButton("继 续", function()
                        Audio.Play("click")
                        onClose()
                    end),
                },
            },
        },
    }

    return UI.Panel {
        width = "100%",
        height = "100%",
        flexDirection = "row",
        justifyContent = "center",
        alignItems = "center",
        backgroundColor = { 26, 22, 20, 200 },
        children = {
            UI.Panel {
                width = "100%",
                maxWidth = Common.CONTENT_MAX_W,
                paddingHorizontal = 16,
                children = { card },
            },
        },
    }
end

return ScreenEvent
