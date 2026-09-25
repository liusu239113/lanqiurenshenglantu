-- ============================================================================
-- AdWidgets — 广告 UI 组件
-- 统一的金色描边广告按钮 + 结果提示
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

--- 构建广告按钮
--- 按钮文案自动包含剩余次数；用完后置灰
---@param state CareerState
---@param placementId string
---@param onReward fun(): string 观看成功后执行发奖，返回提示文案
---@param opts table|nil { height, showDesc }
---@return Button
function AdWidgets.Button(state, placementId, onReward, opts)
    local o = opts or {}
    local p = Ads.PLACEMENTS[placementId]
    local left = Ads.left(state, placementId)
    local available = left > 0

    local text = Ads.buttonText(state, placementId)

    ---@type Button
    local btn = UI.Button {
        text = text,
        width = "100%",
        height = o.height or 50,
        fontSize = 14,
        fontWeight = "bold",
        backgroundColor = available and AD_COLOR or { 210, 200, 184, 255 },
        textColor = available and { 60, 40, 0, 255 } or { 150, 140, 126, 255 },
        hoverBackgroundColor = available and AD_COLOR_HOVER or { 210, 200, 184, 255 },
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
                    -- 恢复按钮（刷新剩余次数文案）
                    local newLeft = Ads.left(state, placementId)
                    self:SetText(Ads.buttonText(state, placementId))
                    if newLeft > 0 then
                        self:SetDisabled(false)
                    end
                end,
                function(msg)  -- 失败：恢复按钮，不发奖
                    UI.Toast.Show(msg, { duration = 2.5, variant = "warning", position = "bottom" })
                    self:SetText(Ads.buttonText(state, placementId))
                    self:SetDisabled(Ads.left(state, placementId) <= 0)
                end
            )
        end,
    }

    return btn
end

--- 构建广告按钮 + 说明文字的组合块
---@param state CareerState
---@param placementId string
---@param onReward fun(): string 发奖并返回提示文案
---@return Panel
function AdWidgets.Card(state, placementId, onReward)
    local p = Ads.PLACEMENTS[placementId]
    if not p then
        return UI.Panel { height = 0 }
    end

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 6,
        children = {
            AdWidgets.Button(state, placementId, onReward),
            UI.Label {
                text = p.desc,
                fontSize = 11,
                fontColor = C.textSub,
                textAlign = "center",
                whiteSpace = "normal",
            },
        },
    }
end

--- 构建「免费福利」聚合面板：把所有可用广告位列在一起
---@param state CareerState
---@param handlers table<string, fun(): string> 各广告位的发奖函数
---@return Panel
function AdWidgets.WelfarePanel(state, handlers)
    ---@type table[]
    local children = {}

    -- 按定义顺序遍历
    local order = {
        "heal", "attrPoints", "sp", "adBreak", "endorse",
        "lottery", "transfer", "talentUp", "youthEarly", "pickClub",
    }

    for i = 1, #order do
        local id = order[i]
        local handler = handlers[id]
        if handler then
            table.insert(children, AdWidgets.Card(state, id, handler))
        end
    end

    return Common.Block("免 费 福 利 · 看 广 告 领 取", children, { barColor = AD_COLOR })
end

return AdWidgets
