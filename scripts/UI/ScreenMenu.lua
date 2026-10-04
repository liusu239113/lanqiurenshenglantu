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
--- 说明：主菜单只负责「开始 / 继续 / 设置」这类会话级操作。
--- 训练馆是生涯内的玩法，入口放在主页底栏，不在这里堆玩法入口。
---@param onNewGame fun()
---@param onContinue fun()
---@param onSettings fun()
---@return Panel
function ScreenMenu.Build(onNewGame, onContinue, onSettings)
    Audio.PlayBgm("menu")

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
            -- 标题（粗黑 + 墨边，漫画封面字）
            -- 全名 7 字较长，字号与字距需比 2 字标题收紧，否则会撑破竖屏宽度
            UI.Label {
                text = Config.TITLE,
                fontSize = 42,
                fontWeight = "bold",
                fontColor = C.primary,
                letterSpacing = 3,
                textStroke = { width = 4, color = "#1a1614" },
                textShadow = { offsetX = 4, offsetY = 4, blur = 0, color = { 26, 22, 20, 160 } },
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

    -- 玩法说明卡（介绍游戏是什么，不是入口）
    table.insert(buttons, Common.Block("这 是 什 么 游 戏", {
        UI.Label {
            text = "从 15 岁的街头球场起步，打比赛、练属性、进季后赛、签代言、转会，"
                .. "直到退役那天回看整个生涯。",
            fontSize = 12,
            fontColor = C.textSub,
            whiteSpace = "normal",
            lineHeight = 1.6,
        },
    }, { barColor = { 168, 62, 148, 255 }, padding = 12 }))

    -- 设置 + 清除存档并排（此前无任何音量/静音入口）
    table.insert(buttons, UI.Panel {
        width = "100%",
        flexDirection = "row",
        gap = 10,
        children = {
            UI.Button {
                text = "设 置",
                flexGrow = 1, flexBasis = 0,
                height = 46,
                fontSize = 14,
                fontWeight = "bold",
                backgroundColor = C.bgCardLight,
                textColor = C.textMain,
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function()
                    Audio.Play("click")
                    onSettings()
                end,
            },
            UI.Button {
                text = "清除存档",
                flexGrow = 1, flexBasis = 0,
                height = 46,
                fontSize = 14,
                fontWeight = "bold",
                backgroundColor = C.bgCard,
                textColor = C.danger,
                borderWidth = 3,
                borderColor = C.outline,
                onClick = function()
                    Audio.Play("click")
                    Career.clearSave()
                    UI.Toast.Show("存档已清除", { duration = 2, variant = "info", position = "top" })
                    UI.SetRoot(ScreenMenu.Build(onNewGame, onContinue, onSettings))
                end,
            },
        },
    })

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
