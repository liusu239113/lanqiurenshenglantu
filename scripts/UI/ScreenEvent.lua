-- ============================================================================
-- ScreenEvent — 剧情事件卡界面（热血漫画分镜风）
-- 全屏覆盖：插图 + 标题条 + 正文 + 选项
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

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
    if bodyText:find("%s", 1, true) then
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
                height = ev.storyChapter and 110 or 180,
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
                        fontSize = ev.storyChapter and 15 or 14,
                        fontColor = C.textMain,
                        whiteSpace = "normal",
                        lineHeight = 1.7,
                    },
                    ev.storyChapter and UI.Label {
                        text = "—— 向下阅读，做出这一年的选择 ——",
                        fontSize = 11,
                        fontColor = C.textSub,
                        textAlign = "center",
                        whiteSpace = "normal",
                    } or UI.Panel { height = 0 },
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

    -- 事件卡限高 + 可滚动：正文可能 3~4 行、选项最多 3 条，
    -- 居中布局下内容超高会被 Yoga 压缩，把文字顶出卡片边框
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

--- 构建选项结果反馈卡
---@param title string
---@param response string
---@param parts string[]
---@param onClose fun()
---@return Panel
function ScreenEvent.BuildResult(title, response, parts, onClose)
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
                    Common.PrimaryButton("继 续", function()
                        Audio.Play("click")
                        onClose()
                    end),
                },
            },
        },
    }

    -- 结果卡限高 + 可滚动：response 文本较长，且可能带多条 fx 标签
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

return ScreenEvent
