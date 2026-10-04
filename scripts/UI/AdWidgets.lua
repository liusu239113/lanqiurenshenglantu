-- ============================================================================
-- AdWidgets — 广告 UI 组件
--
-- 只提供「单个广告按钮」这一种形态：广告点位分散在各玩法子模块内部，
-- 不再提供把多个广告位聚合成一坨的面板（那种做法会让玩家觉得是广告模拟器）。
-- 也不提供「按钮 + 说明文字」的组合卡：广告位现在都长在具体功能里，
-- 语境本身已经说明了它值不值得点，不需要额外一段文案去推销。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Ads = require("Core.Ads")
local Audio = require("Core.Audio")
local Career = require("Core.Career")

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
---@param opts table|nil { height, label, onFinished, onFailure }
---@return Button
function AdWidgets.Button(state, placementId, onReward, opts)
    local o = opts or {}
    local left = Ads.left(state, placementId)
    local available = left > 0

    -- 首次转化文案：第一次点这个点位有额外奖励，把「确定收益」直接摆在按钮上，
    -- 比只写剩余次数更能促成第一次点击（首次之后自动回落成常规文案）。
    local text = o.label or Ads.buttonText(state, placementId)
    local firstHint = Ads.firstBonusText(state, placementId)
    if firstHint then
        local p = Ads.PLACEMENTS[placementId]
        if p and available then
            text = string.format("★ %s（%s）", p.name, firstHint)
        end
    end

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
            local activeRoot = UI.GetRoot()
            -- 点击后立即禁用，防连点
            self:SetDisabled(true)
            self:SetText("广告播放中…")

            Ads.show(
                placementId,   -- 点位 id 是漏斗归因的唯一来源，必须往下传
                function()  -- 成功：当前页面仍有效才扣配额、发奖
                    if UI.GetRoot() ~= activeRoot then return end
                    if state and Career.state ~= state then return end
                    -- 首次观看：先发首次额外奖励。必须在 consume 之前，consume 会写首次标记。
                    local firstMsg = Ads.grantFirstBonus(state, placementId)
                    Ads.consume(state, placementId)

                    -- 发奖回调必须受保护：它一旦抛错，玩家就停在「广告看完了、次数扣了、
                    -- 什么都没拿到」的状态 —— 这是最伤复看意愿的一种失败。
                    -- 出错即退还本次配额（首次奖励已实发，故 firstUse 不回滚，防止重复领）。
                    local okReward, msg = pcall(onReward)
                    if not okReward then
                        Ads.refund(state, placementId)
                        if state then Career.save() end
                        print("[AdWidgets] 发奖回调异常（已退还次数）: " .. tostring(msg))
                        if UI.GetRoot() == activeRoot then
                            UI.Toast.Show("奖励发放出错，本次次数已退还，请再试一次", {
                                duration = 3.5, variant = "warning", position = "top",
                            })
                            self:SetText(o.label or Ads.buttonText(state, placementId))
                            self:SetDisabled(Ads.left(state, placementId) <= 0)
                        end
                        return
                    end

                    if state then Career.save() end
                    print("[AdWidgets] 领奖点位: " .. placementId)
                    if UI.GetRoot() ~= activeRoot then return end
                    Audio.Play("levelup")
                    if firstMsg and firstMsg ~= "" then
                        UI.Toast.Show(firstMsg .. (msg or ""), { duration = 3.5, variant = "success", position = "top" })
                    elseif msg and msg ~= "" then
                        UI.Toast.Show(msg, { duration = 3, variant = "success", position = "top" })
                    end
                    if o.onFinished then
                        o.onFinished()
                        return
                    end
                    self:SetText(o.label or Ads.buttonText(state, placementId))
                    self:SetDisabled(Ads.left(state, placementId) <= 0)
                end,
                function(msg, reason)  -- 失败：不发奖，恢复当前页按钮
                    if UI.GetRoot() ~= activeRoot then return end
                    -- 中途关掉广告不算「出错」——用中性提示 + 更长的停留时间把玩家
                    -- 引导回重试；只有环境类失败（宿主不支持）才值得报警式提示。
                    local retryable = (reason == "manual_close" or reason == "rejected" or reason == "timeout")
                    UI.Toast.Show(msg, {
                        duration = retryable and 3.5 or 2.5,
                        variant = retryable and "info" or "warning",
                        position = "top",
                    })
                    if o.onFailure then
                        o.onFailure()
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
