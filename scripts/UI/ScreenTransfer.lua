-- ============================================================================
-- ScreenTransfer — 转会市场（经纪人办公室）
--
-- 原生路径：每赛季有几次免费的「问价」，经纪人随机带回几份报价（纯运气）
-- 广告路径：全页唯一的广告按钮「定向转会」，看完直接指定想去的球队
--           —— 这就是「确定性替代概率」的刚需模型
--
-- 球队档次不是装饰：直接影响比赛里的球队强度与赛季年薪，见 Core/Transfer.lua
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Transfer = require("Core.Transfer")
local Teams = require("Data.Teams")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local AdWidgets = require("UI.AdWidgets")

local ScreenTransfer = {}

local C = Config.COLORS

-- 档次配色：新军灰 / 中游蓝 / 豪门金
local TIER_COLOR = {
    [1] = { 150, 158, 172, 255 },
    [2] = { 42, 122, 200, 255 },
    [3] = { 232, 168, 32, 255 },
}

---@class TransferDraft
---@field picking boolean 是否处于「定向选择」模式

---@type TransferDraft|nil
local draft_ = nil

--- 取档次配色
---@param tier number
---@return RGBAColor
local function tierColor(tier)
    return TIER_COLOR[tier] or TIER_COLOR[1]
end

-- ---------------------------------------------------------------------------
-- 小组件
-- ---------------------------------------------------------------------------

--- 球队信息行（报价卡 / 选择卡共用）
---@param teamName string
---@param tier number
---@param stage StageDef
---@param rightWidget Panel|Button
---@param disabled boolean
---@return Panel
local function TeamRow(teamName, tier, stage, rightWidget, disabled)
    local color = tierColor(tier)
    local mul = Transfer.salaryMul(tier)

    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        alignItems = "center",
        gap = 10,
        padding = 10,
        backgroundColor = disabled and { 240, 236, 226, 255 } or C.bgCard,
        borderWidth = 2,
        borderColor = disabled and C.outlineSoft or C.outline,
        children = {
            -- 档次色条
            UI.Panel {
                width = 8,
                height = 44,
                flexShrink = 0,
                backgroundColor = color,
                borderWidth = 2,
                borderColor = C.outline,
            },
            UI.Panel {
                flexGrow = 1,
                flexShrink = 1,
                flexBasis = 0,
                flexDirection = "column",
                gap = 3,
                alignItems = "flex-start",
                children = {
                    UI.Panel {
                        flexDirection = "row",
                        alignItems = "center",
                        gap = 6,
                        children = {
                            UI.Label {
                                text = teamName,
                                fontSize = 15,
                                fontWeight = "bold",
                                fontColor = disabled and C.textSub or C.textMain,
                            },
                            Common.Tag(Transfer.tierName(tier), color),
                        },
                    },
                    UI.Label {
                        text = string.format("球队强度 %d  |  年薪 ×%.2f",
                            Transfer.teamStrengthOf(stage, tier), mul),
                        fontSize = 11,
                        fontColor = C.textSub,
                        whiteSpace = "normal",
                    },
                },
            },
            rightWidget,
        },
    }
end

--- 「接受」按钮
---@param enabled boolean
---@param onClick fun()
---@return Button
local function AcceptButton(enabled, onClick)
    return UI.Button {
        text = enabled and "签 约" or "不 符",
        width = 72,
        height = 42,
        fontSize = 14,
        fontWeight = "bold",
        backgroundColor = enabled and C.primary or { 226, 218, 204, 255 },
        textColor = enabled and { 255, 255, 255, 255 } or { 150, 140, 126, 255 },
        hoverBackgroundColor = C.primaryLight,
        pressedBackgroundColor = C.primaryDark,
        borderWidth = 3,
        borderColor = C.outline,
        flexShrink = 0,
        disabled = not enabled,
        onClick = function()
            Audio.Play("click")
            onClick()
        end,
    }
end

-- ---------------------------------------------------------------------------
-- 主构建函数
-- ---------------------------------------------------------------------------

--- 构建转会市场
---@param onBack fun()
---@return Panel
function ScreenTransfer.Build(onBack)
    Audio.PlayBgm("daily")

    draft_ = { picking = Career.state ~= nil and Career.state.pickTeamCredit == true }

    ---@type fun(): Panel
    local render
    --- 渲染并设为当前根（内部重绘也必须设根，否则界面不刷新）
    ---@type fun(): Panel
    local renderAndSet

    render = function()
        local state = Career.state
        local stage = Career.getStage()
        if not state then
            onBack()
            return UI.Panel { width = "100%", height = "100%" }
        end

        local draft = draft_
        if not draft then
            draft = { picking = state.pickTeamCredit == true }
            draft_ = draft
        end

        local myTier = state.teamTier or 1
        local left = Transfer.offersLeft(state)
        local ov = Career.getOverall()

        ---@type string[]
        local offers = state.transferOffers or {}

        --- 接受一份报价
        ---@param teamName string
        ---@param reason string
        local function sign(teamName, reason)
            local msg = Transfer.accept(state, stage, teamName, reason)
            state.transferOffers = {}
            if reason == "通过定向转会指定了下家" then state.pickTeamCredit = false end
            draft.picking = false
            Career.save()
            Audio.Play("levelup")
            UI.Toast.Show(msg, { duration = 3, variant = "success", position = "top" })
            renderAndSet()
        end

        -- ---- 当前球队 ----
        local currentCard = Common.Block("当 前 球 队", {
            TeamRow(state.team or "自由身", myTier, stage, UI.Panel { width = 0 }, false),
            Common.Sub(string.format(
                "球队档次决定队友水平与年薪倍率。你的综合评分 %d，%s档球队要求 %d 分。",
                ov, Transfer.tierName(3), Transfer.requiredOverall(3)), 11),
        }, { barColor = C.textMain })

        -- ---- 原生路径：问价 ----
        ---@type table[]
        local askChildren = {
            Common.Sub(string.format("经纪人每赛季可以免费替你问 %d 次价，能不能碰上好球队全看运气。",
                Config.TRANSFER.offersPerSeason), 11),
        }

        -- 已有的报价
        if #offers > 0 then
            for i = 1, #offers do
                local name = offers[i]
                local tier = Teams.tierOf(stage.id, name)
                local ok = Transfer.canJoin(state, tier)
                table.insert(askChildren, TeamRow(name, tier, stage,
                    AcceptButton(ok, function()
                        sign(name, "接受了经纪人带来的报价")
                    end), not ok))
            end
        else
            table.insert(askChildren, UI.Panel {
                width = "100%",
                padding = 12,
                backgroundColor = C.bgCardLight,
                borderWidth = 2,
                borderColor = C.outlineSoft,
                children = {
                    UI.Label {
                        text = "暂时没有报价，让经纪人去问问看。",
                        fontSize = 12,
                        fontColor = C.textSub,
                        textAlign = "center",
                        whiteSpace = "normal",
                    },
                },
            })
        end

        table.insert(askChildren, UI.Button {
            text = left > 0
                and string.format("让经纪人物色下家（本季剩 %d 次）", left)
                or "本赛季问价次数已用完",
            width = "100%",
            height = 48,
            fontSize = 14,
            fontWeight = "bold",
            backgroundColor = left > 0 and C.secondary or { 226, 218, 204, 255 },
            textColor = left > 0 and { 255, 255, 255, 255 } or { 150, 140, 126, 255 },
            hoverBackgroundColor = { 72, 152, 226, 255 },
            pressedBackgroundColor = { 28, 96, 168, 255 },
            borderWidth = 3,
            borderColor = C.outline,
            disabled = left <= 0,
            onClick = function()
                Audio.Play("click")
                Transfer.consumeOffer(state)
                state.transferOffers = Transfer.rollOffers(state, stage, Config.TRANSFER.offersPerRoll)
                Career.save()
                renderAndSet()
            end,
        })

        local askBlock = Common.Block("经 纪 人 问 价", askChildren, { barColor = C.secondary })

        -- ---- 广告路径：定向转会 ----
        ---@type table[]
        local adChildren = {
            AdWidgets.AdTag("经纪人说：「有些球队，不用等抽签——只要你点头。」"),
        }

        if state.pickTeamCredit == true then
            draft.picking = true
        end
        if not draft.picking then
            local canPickBetter = false
            for tier = 3, 1, -1 do
                local teams = Teams.teamsInTier(stage.id, tier)
                for i = 1, #teams do
                    if teams[i] ~= state.team and Transfer.canSign(state, stage, teams[i]) then
                        canPickBetter = true
                        break
                    end
                end
                if canPickBetter then break end
            end
            if canPickBetter then
                table.insert(adChildren, AdWidgets.Button(state, "pickTeam", function()
                    state.pickTeamCredit = true
                    draft.picking = true
                    return "定向转会机会已保留，选定球队后才会使用"
                end, { height = 54, fontSize = 15, onFinished = function() renderAndSet() end }))
            else
                table.insert(adChildren, Common.Sub("目前没有符合签约条件的其他球队，无需看广告。", 11))
            end
        else
            -- 定向模式：列出全部球队，够格就能直接签
            table.insert(adChildren, UI.Label {
                text = "广告解锁的转会机会已保留；选一支符合条件的球队签约，暂不签约可随时回来。",
                fontSize = 12,
                fontWeight = "bold",
                fontColor = C.textMain,
            })
            for tier = 3, 1, -1 do
                local list = Teams.teamsInTier(stage.id, tier)
                for i = 1, #list do
                    local name = list[i]
                    local ok, reason = Transfer.canSign(state, stage, name)
                    local row = TeamRow(name, tier, stage,
                        AcceptButton(ok, function()
                            sign(name, "通过定向转会指定了下家")
                        end), not ok)
                    -- 不够格时补一行原因
                    if not ok then
                        table.insert(adChildren, UI.Panel {
                            width = "100%",
                            flexDirection = "column",
                            gap = 4,
                            children = {
                                row,
                                UI.Label {
                                    text = "　" .. reason,
                                    fontSize = 11,
                                    fontColor = C.danger,
                                    whiteSpace = "normal",
                                },
                            },
                        })
                    else
                        table.insert(adChildren, row)
                    end
                end
            end
            table.insert(adChildren, Common.OutlineButton("暂 不 签 约（机会保留）", function()
                Audio.Play("click")
                onBack()
            end, { height = 44, fontSize = 13 }))
        end

        local adBlock = Common.Block("定 向 转 会 服 务", adChildren,
            { barColor = { 232, 168, 32, 255 } })

        return Common.Screen(Config.ART.bgOffice, {
            Common.TopBar("转 会 市 场", function()
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
                            Common.Sub("打球是打球，去处是去处。经纪人负责后者。", 13),
                            currentCard,
                            askBlock,
                            adBlock,
                        },
                    },
                },
            },
        }, { dim = 0.5 })
    end

    renderAndSet = function()
        local screen = render()
        UI.SetRoot(screen)
        return screen
    end

    return renderAndSet()
end

return ScreenTransfer
