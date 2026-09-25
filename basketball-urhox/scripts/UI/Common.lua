-- ============================================================================
-- Common — 通用 UI 构建块（热血漫画分镜风）
-- 米黄纸底 + 墨黑粗描边 + 直角分镜格 + 高饱和橙红
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")

local Common = {}

local C = Config.COLORS

Common.CONTENT_MAX_W = Config.LAYOUT.maxContentWidth

-- ---------------------------------------------------------------------------
-- 基础容器
-- ---------------------------------------------------------------------------

--- 全屏根容器：米黄纸底 + 可选背景图 + 居中内容列
---@param bgPath string|nil
---@param contentChildren table
---@param opts table|nil { dim = number, paper = boolean }
---@return Panel
function Common.Screen(bgPath, contentChildren, opts)
    local o = opts or {}
    local dim = o.dim or 0.35

    local layers = {}

    -- 纸底
    table.insert(layers, UI.Panel {
        position = "absolute",
        top = 0, left = 0, right = 0, bottom = 0,
        backgroundColor = C.bgDeep,
    })

    -- 背景图
    if bgPath then
        table.insert(layers, UI.Panel {
            position = "absolute",
            top = 0, left = 0, right = 0, bottom = 0,
            backgroundImage = bgPath,
            backgroundFit = "cover",
        })
        -- 提亮压暗层（米黄半透明，营造印刷纸感）
        table.insert(layers, UI.Panel {
            position = "absolute",
            top = 0, left = 0, right = 0, bottom = 0,
            backgroundColor = { 250, 244, 228, math.floor(dim * 255) },
        })
    end

    -- 内容列
    table.insert(layers, UI.Panel {
        width = "100%",
        height = "100%",
        maxWidth = Common.CONTENT_MAX_W,
        alignSelf = "center",
        flexDirection = "column",
        children = contentChildren,
    })

    return UI.Panel {
        width = "100%",
        height = "100%",
        flexDirection = "row",
        justifyContent = "center",
        backgroundColor = C.bgDeep,
        children = layers,
    }
end

-- ---------------------------------------------------------------------------
-- 文字
-- ---------------------------------------------------------------------------

--- 漫画大标题（粗黑 + 白描边，用于标题）
---@param text string
---@param size number|nil
---@param color RGBAColor|nil
---@return Label
function Common.Title(text, size, color)
    return UI.Label {
        text = text,
        fontSize = size or 24,
        fontWeight = "bold",
        fontColor = color or C.textMain,
        letterSpacing = 2,
        whiteSpace = "normal",
    }
end

--- 副标题
---@param text string
---@param size number|nil
---@return Label
function Common.Sub(text, size)
    return UI.Label {
        text = text,
        fontSize = size or 13,
        fontColor = C.textSub,
        whiteSpace = "normal",
        lineHeight = 1.5,
    }
end

--- 正文
---@param text string
---@param size number|nil
---@return Label
function Common.Body(text, size)
    return UI.Label {
        text = text,
        fontSize = size or 14,
        fontColor = C.textMain,
        whiteSpace = "normal",
        lineHeight = 1.6,
    }
end

-- ---------------------------------------------------------------------------
-- 分镜格（漫画格）
-- ---------------------------------------------------------------------------

--- 漫画分镜格：白底 + 粗墨线 + 直角
---@param children table
---@param opts table|nil { gap, padding, bg, accent }
---@return Panel
function Common.Panel_(children, opts)
    local o = opts or {}
    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = o.gap or 10,
        padding = o.padding or 14,
        backgroundColor = o.bg or C.bgCard,
        borderWidth = o.borderWidth or 3,
        borderColor = o.borderColor or C.outline,
        children = children,
    }
end

--- 分镜格标题条：橙红底 + 白字（漫画格标题）
---@param text string
---@param color RGBAColor|nil
---@return Panel
function Common.Bar(text, color)
    return UI.Panel {
        width = "100%",
        paddingHorizontal = 12,
        paddingVertical = 7,
        backgroundColor = color or C.primary,
        borderBottomWidth = 3,
        borderBottomColor = C.outline,
        children = {
            UI.Label {
                text = text,
                fontSize = 15,
                fontWeight = "bold",
                fontColor = { 255, 255, 255, 255 },
                letterSpacing = 2,
            },
        },
    }
end

--- 带标题条的完整分镜格
---@param title string
---@param children table
---@param opts table|nil { barColor, gap, padding }
---@return Panel
function Common.Block(title, children, opts)
    local o = opts or {}
    local body = { Common.Bar(title, o.barColor) }
    for i = 1, #children do
        table.insert(body, children[i])
    end
    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        backgroundColor = C.bgCard,
        borderWidth = 3,
        borderColor = C.outline,
        overflow = "hidden",
        children = {
            Common.Bar(title, o.barColor),
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = o.gap or 10,
                padding = o.padding or 14,
                children = children,
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 属性条（漫画风：分段式）
-- ---------------------------------------------------------------------------

--- 属性行：图标 + 名称 + 数值 + 分段条
---@param attrDef AttrDef
---@param value number
---@return Panel
function Common.AttrRow(attrDef, value)
    local color = Config.ATTR_COLORS[attrDef.key] or C.primary
    local pct = math.min(100, math.max(0, value))

    return UI.Panel {
        flexDirection = "row",
        alignItems = "center",
        gap = 10,
        children = {
            UI.Panel {
                width = 28, height = 28,
                backgroundImage = attrDef.icon,
                backgroundFit = "contain",
                flexShrink = 0,
            },
            UI.Panel {
                flexGrow = 1,
                flexShrink = 1,
                flexBasis = 0,
                flexDirection = "column",
                gap = 4,
                children = {
                    UI.Panel {
                        flexDirection = "row",
                        justifyContent = "space-between",
                        alignItems = "center",
                        children = {
                            UI.Label {
                                text = attrDef.name,
                                fontSize = 13,
                                fontWeight = "bold",
                                fontColor = C.textMain,
                            },
                            UI.Label {
                                text = tostring(math.floor(value)),
                                fontSize = 16,
                                fontWeight = "bold",
                                fontColor = color,
                            },
                        },
                    },
                    UI.ProgressBar {
                        value = pct,
                        max = 100,
                        height = 10,
                        showLabel = false,
                        fillColor = color,
                        transition = "value 0.4s easeOut",
                    },
                },
            },
        },
    }
end

--- 状态条
---@param label string
---@param value number
---@param color RGBAColor
---@return Panel
function Common.StatBar(label, value, color)
    return UI.Panel {
        flexGrow = 1,
        flexShrink = 1,
        flexBasis = 0,
        flexDirection = "column",
        gap = 4,
        children = {
            UI.Panel {
                flexDirection = "row",
                justifyContent = "space-between",
                children = {
                    UI.Label { text = label, fontSize = 11, fontWeight = "bold", fontColor = C.textSub },
                    UI.Label {
                        text = tostring(math.floor(value)),
                        fontSize = 13,
                        fontWeight = "bold",
                        fontColor = color,
                    },
                },
            },
            UI.ProgressBar {
                value = math.min(100, math.max(0, value)),
                max = 100,
                height = 9,
                showLabel = false,
                fillColor = color,
            },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 按钮（漫画风：直角 + 粗墨线 + 硬阴影）
-- ---------------------------------------------------------------------------

--- 主按钮（橙红，粗墨边）
---@param text string
---@param onClick fun()
---@return Button
function Common.PrimaryButton(text, onClick)
    return UI.Button {
        text = text,
        width = "100%",
        height = 56,
        fontSize = 18,
        fontWeight = "bold",
        backgroundColor = C.primary,
        textColor = { 255, 255, 255, 255 },
        hoverBackgroundColor = C.primaryLight,
        pressedBackgroundColor = C.primaryDark,
        borderWidth = 3,
        borderColor = C.outline,
        letterSpacing = 3,
        onClick = function()
            onClick()
        end,
    }
end

--- 次按钮（天蓝）
---@param text string
---@param onClick fun()
---@return Button
function Common.SecondaryButton(text, onClick)
    return UI.Button {
        text = text,
        width = "100%",
        height = 52,
        fontSize = 16,
        fontWeight = "bold",
        backgroundColor = C.secondary,
        textColor = { 255, 255, 255, 255 },
        hoverBackgroundColor = { 72, 152, 226, 255 },
        pressedBackgroundColor = { 28, 96, 168, 255 },
        borderWidth = 3,
        borderColor = C.outline,
        letterSpacing = 2,
        onClick = function()
            onClick()
        end,
    }
end

--- 白底墨边按钮（漫画格内用）
---@param text string
---@param onClick fun()
---@param opts table|nil { height, fontSize }
---@return Button
function Common.OutlineButton(text, onClick, opts)
    local o = opts or {}
    return UI.Button {
        text = text,
        width = "100%",
        height = o.height or 50,
        fontSize = o.fontSize or 15,
        fontWeight = "bold",
        backgroundColor = C.bgCard,
        textColor = C.textMain,
        hoverBackgroundColor = C.bgCardLight,
        pressedBackgroundColor = { 236, 226, 208, 255 },
        borderWidth = 3,
        borderColor = C.outline,
        onClick = function()
            onClick()
        end,
    }
end

-- ---------------------------------------------------------------------------
-- 小部件
-- ---------------------------------------------------------------------------

--- 标签贴纸（黑底白字或彩底白字）
---@param text string
---@param color RGBAColor|nil
---@return Panel
function Common.Tag(text, color)
    return UI.Panel {
        paddingHorizontal = 9,
        paddingVertical = 3,
        backgroundColor = color or C.textMain,
        children = {
            UI.Label {
                text = text,
                fontSize = 11,
                fontWeight = "bold",
                fontColor = { 255, 255, 255, 255 },
            },
        },
    }
end

--- 键值行
---@param key string
---@param value string
---@param valueColor RGBAColor|nil
---@return Panel
function Common.KV(key, value, valueColor)
    return UI.Panel {
        flexDirection = "row",
        justifyContent = "space-between",
        alignItems = "center",
        children = {
            UI.Label { text = key, fontSize = 13, fontColor = C.textSub },
            UI.Label {
                text = value,
                fontSize = 15,
                fontWeight = "bold",
                fontColor = valueColor or C.textMain,
            },
        },
    }
end

--- 数值大块（漫画数据框）
---@param value string
---@param label string
---@param color RGBAColor|nil
---@return Panel
function Common.StatBox(value, label, color)
    return UI.Panel {
        flexGrow = 1,
        flexBasis = 0,
        flexDirection = "column",
        alignItems = "center",
        gap = 1,
        paddingVertical = 8,
        backgroundColor = C.bgCardLight,
        borderWidth = 2,
        borderColor = C.outline,
        children = {
            UI.Label {
                text = value,
                fontSize = 20,
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

return Common
