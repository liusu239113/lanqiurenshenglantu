-- ============================================================================
-- ScreenMenu — 主菜单（热血漫画分镜风）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenMenu = {}

local C = Config.COLORS

--- 构建主菜单
---@param onNewGame fun()
---@param onContinue fun()
---@param onTraining fun()
---@return Panel
function ScreenMenu.Build(onNewGame, onContinue, onTraining)
    Audio.PlayBgm("daily")

    local hasSave = Career.hasSave()

    -- ---- Logo 区（漫画封面感）----
    local logoBlock = UI.Panel {
        flexDirection = "column",
        alignItems = "center",
        gap = 10,
        paddingTop = 30,
        children = {
            UI.Panel {
                width = 168, height = 168,
                backgroundImage = Config.ART.logo,
                backgroundFit = "contain",
            },
            -- 标题（粗黑 + 白描边，漫画封面字）
            UI.Label {
                text = Config.TITLE,
                fontSize = 62,
                fontWeight = "bold",
                fontColor = C.primary,
                letterSpacing = 12,
                textStroke = { width = 5, color = "#1a1614" },
                textShadow = { offsetX = 5, offsetY = 5, blur = 0, color = { 26, 22, 20, 160 } },
            },
            -- 副标题条（黑底白字）
            UI.Panel {
                paddingHorizontal = 16,
                paddingVertical = 7,
                backgroundColor = C.textMain,
                children = {
                    UI.Label {
                        text = Config.SUBTITLE,
                        fontSize = 14,
                        fontWeight = "bold",
                        fontColor = { 255, 255, 255, 255 },
                        letterSpacing = 3,
                    },
                },
            },
        },
    }

    -- ---- 按钮区 ----
    ---@type table[]
    local buttons = {}

    if hasSave then
        table.insert(buttons, Common.PrimaryButton("继 续 生 涯", function()
            Audio.Play("click")
            onContinue()
        end))
    end

    table.insert(buttons, Common.PrimaryButton(hasSave and "重 新 开 始" or "开 始 生 涯", function()
        Audio.Play("click")
        onNewGame()
    end))

    -- 训练馆入口（需要已有球员）
    if hasSave then
        table.insert(buttons, UI.Button {
            text = "🏀 训 练 馆 · 玩 法",
            width = "100%",
            height = 52,
            fontSize = 16,
            fontWeight = "bold",
            backgroundColor = { 168, 62, 148, 255 },
            textColor = { 255, 255, 255, 255 },
            borderWidth = 3,
            borderColor = C.outline,
            letterSpacing = 2,
            onClick = function()
                Audio.Play("click")
                onTraining()
            end,
        })
    end

    -- 玩法说明卡
    table.insert(buttons, Common.Block("核 心 玩 法", {
        UI.Label {
            text = "投篮时机条 · 一对一突破 · 防守读心 · 斗牛赛 · 战术板",
            fontSize = 12,
            fontColor = C.textSub,
            whiteSpace = "normal",
            lineHeight = 1.6,
        },
    }, { barColor = { 168, 62, 148, 255 }, padding = 12 }))

    table.insert(buttons, Common.OutlineButton("清除存档", function()
        Audio.Play("click")
        Career.clearSave()
        UI.Toast.Show("存档已清除", { duration = 2, variant = "info", position = "bottom" })
        UI.SetRoot(ScreenMenu.Build(onNewGame, onContinue, onTraining))
    end, { height = 46, fontSize = 14 }))

    local buttonBlock = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 12,
        paddingHorizontal = 24,
        paddingBottom = 24,
        children = buttons,
    }

    local footer = UI.Label {
        text = "v" .. Config.VERSION .. "  ·  原创篮球生涯模拟",
        fontSize = 11,
        fontColor = { 120, 108, 96, 200 },
        textAlign = "center",
        marginBottom = 16,
    }

    return Common.Screen(Config.ART.bgMenu, {
        UI.Panel {
            flexGrow = 1,
            flexBasis = 0,
            flexDirection = "column",
            justifyContent = "center",
            children = { logoBlock },
        },
        buttonBlock,
        footer,
    }, { dim = 0.42 })
end

return ScreenMenu
