-- ============================================================================
-- Theme — 《篮途》热血漫画分镜风主题
-- 视觉语言：米黄纸底 + 墨黑粗描边 + 直角分镜格 + 高饱和橙红
-- 与参考游戏的暗色圆角卡片风刻意拉开距离
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")

local Theme = {}

local C = Config.COLORS

--- 构建并注册游戏主题
---@return table
function Theme.Setup()
    local base = UI.Theme.GetRegisteredTheme("default-dark")
    if not base then
        base = UI.Theme.defaultTheme
    end

    local gameTheme = UI.Theme.ExtendTheme(base, {
        -- 中文字体（粗黑字重，契合漫画感）
        fonts = {
            {
                family = "sans",
                weights = {
                    normal = "Fonts/NotoSansSC-Black.ttf",
                    bold = "Fonts/NotoSansSC-Black.ttf",
                },
            },
        },

        colors = {
            -- 主色：热血橙红
            primary        = C.primary,
            primaryHover   = C.primaryLight,
            primaryPressed = C.primaryDark,
            primaryDeep    = C.primaryDark,
            primarySoft    = { 255, 77, 46, 50 },

            -- 次要色：天空蓝
            secondary        = C.secondary,
            secondaryHover   = { 72, 152, 226, 255 },
            secondaryPressed = { 28, 96, 168, 255 },

            -- 背景：米黄纸底（亮底）
            background  = C.bgDeep,
            surface     = C.bgPanel,
            surfaceAlt  = C.bgCardLight,
            surfaceRaised = C.bgCard,

            -- 文字：墨黑
            text            = C.textMain,
            textSecondary   = C.textSub,
            textMuted       = { 138, 126, 112, 255 },
            textPlaceholder = { 168, 156, 142, 255 },
            textInverse     = { 255, 255, 255, 255 },

            -- 边框：漫画墨线
            border       = C.outline,
            borderStrong = C.outline,
            divider      = { 26, 22, 20, 90 },

            -- 状态色
            success        = C.success,
            successHover   = { 82, 188, 108, 255 },
            warning        = C.accent,
            warningPressed = { 226, 176, 41, 255 },
            error          = C.danger,
            errorHover     = { 232, 72, 66, 255 },
            danger         = C.danger,
            dangerHover    = { 232, 72, 66, 255 },

            -- 遮罩
            overlay = { 26, 22, 20, 190 },
        },

        -- 直角为主，少量小圆角（漫画分镜格）
        radius = {
            none = 0,
            xs = 0,
            sm = 2,
            md = 4,
            lg = 6,
            xl = 8,
            full = 999,
        },

        componentDefaults = {
            borderRadius = 0,
        },

        components = {
            Button = {
                borderRadius = 0,        -- 直角，漫画按钮
                height = 54,
                fontSize = 17,
                fontWeight = "bold",
                borderWidth = 3,         -- 粗墨线
                borderColor = C.outline,
                letterSpacing = 2,
            },
            Card = {
                borderRadius = 0,
                borderWidth = 3,
                borderColor = C.outline,
                backgroundColor = C.bgCard,
            },
            Panel = {
                borderRadius = 0,
            },
            Modal = {
                borderRadius = 0,
                borderWidth = 3,
                borderColor = C.outline,
            },
            ProgressBar = {
                height = 12,
                borderRadius = 0,
                backgroundColor = { 228, 218, 200, 255 },
                borderWidth = 2,
                borderColor = C.outline,
            },
            Label = {
                fontFamily = "sans",
            },
        },
    })

    UI.Theme.RegisterTheme("basketball", gameTheme)
    print("[Theme] 热血漫画分镜风主题已注册")
    return gameTheme
end

return Theme
