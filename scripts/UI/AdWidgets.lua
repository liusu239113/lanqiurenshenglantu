-- ============================================================================
-- AdWidgets — 广告 UI 组件
--
-- 只提供「单个广告按钮」这一种形态：广告点位分散在各玩法子模块内部，
-- 不再提供把多个广告位聚合成一坨的面板（那种做法会让玩家觉得是广告模拟器）。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Ads = require("Core.Ads")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local AdWidgets = {}

local C = Config.COLORS

-- 广告按钮主题色（高光黄，与主色橙红区分）
local AD_COLOR = { 232, 168, 32, 255 }
local AD_COLOR_HOVER = { 250, 196, 72, 255 }
-- 用完/不可用时的置灰色
local AD_COLOR_OFF = { 210, 200, 184, 255 }
local AD_TEXT_OFF = { 150, 140, 126, 255 }

--- 构建广告按钮
--- 按钮文案自动包含剩余次数；用完后置灰
---@param state CareerState|nil 无配额的广告位（如建角抽卡）可以传 nil
---@param placementId string
---@param onReward fun(): string 观看成功后执行发奖，返回提示文案
---@param opts table|nil { height, label, showDesc, onFinished }
---@return Button
function AdWidgets.Button(state, placementId, onReward, opts)
    local o = opts or {}
    local left = Ads.left(state, placementId)
    local available = left > 0

    local text = o.label or Ads.buttonText(state, placementId)

    ---@type Button
    local btn = UI.Button {
        text = text,
        width = "100%",
        height = o.height or 50,
        fontSize = o.fontSize or 14,
        fontWeight = "bold",
        backgroundColor = available and AD_COLOR or AD_COLOR_OFF,
        textColor = available and { 60, 40, 0, 255 } or AD_TEXT_OFF,
        hoverBackgroundColor = available and AD_COLOR_HOVER or AD_COLOR_OFF,
        pressedBackgroundColor = { 196, 138, 16, 255 },
        borderWidth = 3,
        borderColor = C.outline,
        letterSpacing = 1,
        disabled = not available,
        onClick = function(self)
            Audio.Play("click")
            -- 点击后立即禁用，防连点
            self:SetDisabled(true)
            self:SetText("广告播放中…")

            Ads.show(
                function()  -- 成功：扣配额 + 发奖
                    Ads.consume(state, placementId)
                    local msg = onReward()
                    Audio.Play("levelup")
                    if msg and msg ~= "" then
                        UI.Toast.Show(msg, { duration = 3, variant = "success", position = "bottom" })
                    end
                    if o.onFinished then
                        -- 交给调用方重建界面（例如建角抽卡需要刷新卡池）
                        o.onFinished()
                        return
                    end
                    -- 恢复按钮（刷新剩余次数文案）
                    self:SetText(o.label or Ads.buttonText(state, placementId))
                    if Ads.left(state, placementId) > 0 then
                        self:SetDisabled(false)
                    end
                end,
                function(msg)  -- 失败：恢复按钮，不发奖
                    UI.Toast.Show(msg, { duration = 2.5, variant = "warning", position = "bottom" })
                    if o.onFinished then
                        o.onFinished()
                        return
                    end
                    self:SetText(o.label or Ads.buttonText(state, placementId))
                    self:SetDisabled(Ads.left(state, placementId) <= 0)
                end
            )
        end,
    }

    return btn
end

--- 构建广告按钮 + 说明文字的组合块（放在子模块里，一个界面只放一个）
---@param state CareerState
---@param placementId string
---@param onReward fun(): string 发奖并返回提示文案
---@param opts table|nil { label, onFinished, note }
---@return Panel
function AdWidgets.Card(state, placementId, onReward, opts)
    local o = opts or {}
    local p = Ads.PLACEMENTS[placementId]
    if not p then
        return UI.Panel { height = 0 }
    end

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 6,
        children = {
            AdWidgets.Button(state, placementId, onReward, o),
            UI.Label {
                text = o.note or p.desc,
                fontSize = 11,
                fontColor = C.textSub,
                textAlign = "center",
                whiteSpace = "normal",
            },
        },
    }
end

--- 金色描边的「广告选项」按钮（用于弹窗里的 A/B 选择，例如队医询问）
--- 与主按钮配对出现，让玩家自己决定走哪条路
---@param text string
---@param onClick fun()
---@return Button
function AdWidgets.OptionButton(text, onClick)
    return UI.Button {
        text = text,
        width = "100%",
        height = 52,
        fontSize = 15,
        fontWeight = "bold",
        backgroundColor = AD_COLOR,
        textColor = { 60, 40, 0, 255 },
        hoverBackgroundColor = AD_COLOR_HOVER,
        pressedBackgroundColor = { 196, 138, 16, 255 },
        borderWidth = 3,
        borderColor = C.outline,
        onClick = function()
            Audio.Play("click")
            onClick()
        end,
    }
end

--- 广告说明小标签（叙事包装：把"看广告"说成人话）
---@param text string
---@return Panel
function AdWidgets.AdTag(text)
    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        alignItems = "center",
        gap = 8,
        padding = 9,
        backgroundColor = { 255, 246, 224, 255 },
        borderWidth = 2,
        borderColor = AD_COLOR,
        children = {
            UI.Label { text = "▶", fontSize = 12, fontWeight = "bold", fontColor = AD_COLOR, flexShrink = 0 },
            -- 换行文本必须给确定宽度（flexGrow + flexBasis = 0），否则会塌成 0 宽不显示
            UI.Label {
                text = text,
                fontSize = 11,
                fontColor = C.textSub,
                whiteSpace = "normal",
                lineHeight = 1.4,
                flexGrow = 1,
                flexShrink = 1,
                flexBasis = 0,
            },
        },
    }
end

return AdWidgets
