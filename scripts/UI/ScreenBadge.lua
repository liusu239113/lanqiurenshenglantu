-- ============================================================================
-- ScreenBadge — 徽章墙（生涯里程碑被动加成）
--
-- 玩法闭环：
--   打比赛 / 训练 → 累积统计 → 自动解锁徽章（被动加成生效）
--   → 每解锁 1 枚 +1 徽章点数 → 在本页强化已解锁徽章
--
-- 设计意图：让"长期坚持某条路线"获得可见身份感，并制造路线取舍
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local Badges = require("Data.Badges")

local ScreenBadge = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 单枚徽章卡
-- ---------------------------------------------------------------------------

---@param state CareerState
---@param def BadgeDef
---@param onUpgrade fun(id: string)
---@return Panel
local function BadgeCard(state, def, onUpgrade)
    local lv = Badges.level(state, def.id)
    local unlocked = lv > 0
    local maxed = lv >= def.maxLevel
    local progress = Badges.progress(state, def.track)
    local points = state.skillPoints or 0

    local pct = math.min(1.0, progress / def.need)
    local pctText = string.format("%d / %d", math.min(progress, def.need), def.need)

    -- 加成文案
    ---@type string[]
    local bonusParts = {}
    local BONUS_NAMES = {
        scoring = "得分", playmaking = "组织", defense = "防守",
        athletic = "体能", iq = "意识", fameGain = "人气获取",
        moneyGain = "收入", staminaMax = "体能上限", moraleMax = "士气上限",
    }
    for k, v in pairs(def.bonus) do
        local label = BONUS_NAMES[k] or k
        local total = v * lv
        if unlocked then
            bonusParts[#bonusParts + 1] = string.format("%s +%d", label, total)
        else
            bonusParts[#bonusParts + 1] = string.format("%s +%d/级", label, v)
        end
    end
    local bonusText = table.concat(bonusParts, " · ")

    -- 升级消耗
    local cost = lv
    local canUpgrade = unlocked and not maxed and points >= cost

    return UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 8,
        padding = 12,
        borderWidth = 3,
        borderColor = unlocked and C.outline or { 180, 170, 156, 255 },
        backgroundColor = unlocked and { 255, 252, 244, 255 } or { 238, 232, 220, 255 },
        children = {
            -- 标题行
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                alignItems = "center",
                gap = 10,
                children = {
                    UI.Label {
                        text = def.icon or "◆",
                        fontSize = 26,
                        flexShrink = 0,
                    },
                    UI.Panel {
                        flexGrow = 1,
                        flexBasis = 0,
                        flexDirection = "column",
                        gap = 2,
                        children = {
                            UI.Panel {
                                width = "100%",
                                flexDirection = "row",
                                alignItems = "center",
                                gap = 6,
                                children = {
                                    UI.Label {
                                        text = def.name,
                                        fontSize = 16,
                                        fontWeight = "bold",
                                        fontColor = unlocked and C.textMain or C.textSub,
                                    },
                                    unlocked and UI.Label {
                                        text = string.format("Lv.%d", lv),
                                        fontSize = 12,
                                        fontWeight = "bold",
                                        fontColor = { 255, 255, 255, 255 },
                                        paddingHorizontal = 6,
                                        paddingVertical = 1,
                                        backgroundColor = maxed and C.primary or C.secondary,
                                    } or UI.Panel { width = 0 },
                                },
                            },
                            UI.Label {
                                text = def.desc,
                                fontSize = 11,
                                fontColor = C.textSub,
                                whiteSpace = "normal",
                            },
                        },
                    },
                },
            },

            -- 加成
            UI.Label {
                text = "加成：" .. bonusText,
                fontSize = 12,
                fontWeight = "bold",
                fontColor = unlocked and C.success or C.textSub,
                whiteSpace = "normal",
            },

            -- 进度条
            UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 4,
                children = {
                    UI.Panel {
                        width = "100%",
                        height = 8,
                        backgroundColor = { 210, 200, 184, 255 },
                        overflow = "hidden",
                        children = {
                            UI.Panel {
                                width = string.format("%d%%", math.floor(pct * 100)),
                                height = "100%",
                                backgroundColor = unlocked and C.success or C.primary,
                            },
                        },
                    },
                    UI.Label {
                        text = unlocked and ("进度 " .. pctText) or (pctText .. "（未解锁）"),
                        fontSize = 10,
                        fontColor = C.textSub,
                    },
                },
            },

            -- 强化按钮
            unlocked and not maxed and UI.Button {
                width = "100%",
                text = string.format("强化至 Lv.%d（消耗 %d 徽章点）", lv + 1, cost),
                variant = canUpgrade and "primary" or "ghost",
                disabled = not canUpgrade,
                onClick = function()
                    Audio.Play("click")
                    onUpgrade(def.id)
                end,
            } or UI.Panel { height = 0 },

            maxed and UI.Label {
                text = "★ 已达最高等级",
                fontSize = 12,
                fontWeight = "bold",
                fontColor = C.primary,
                textAlign = "center",
                width = "100%",
            } or UI.Panel { height = 0 },
        },
    }
end

-- ---------------------------------------------------------------------------
-- 构建
-- ---------------------------------------------------------------------------

--- 构建徽章墙
---@param onBack fun()
---@return Panel
function ScreenBadge.Build(onBack)
    local state = Career.state
    if not state then
        return Common.Screen(Config.ART.bgTrainingRoom, {
            Common.TopBar("徽 章 墙", onBack),
            Common.Sub("无存档", 14),
        })
    end

    Audio.PlayBgm("daily")

    -- 进入时先检查一次解锁（覆盖训练/商业活动带来的进度变化）
    Badges.check(state)

    local refresh

    local function buildList()
        local points = state.skillPoints or 0
        local unlockedCount = 0
        for i = 1, #Badges.LIST do
            if Badges.isUnlocked(state, Badges.LIST[i].id) then
                unlockedCount = unlockedCount + 1
            end
        end

        ---@type table[]
        local cards = {}

        -- 资源卡
        table.insert(cards, UI.Panel {
            width = "100%",
            flexDirection = "row",
            gap = 10,
            children = {
                Common.StatBox(string.format("%d/%d", unlockedCount, #Badges.LIST), "已解锁", C.primary),
                Common.StatBox(tostring(points), "徽章点", C.secondary),
            },
        })

        -- 说明文字：显式给高度，避免被下方卡片压住
        table.insert(cards, UI.Label {
            text = "里程碑自动解锁，被动加成即时生效；徽章点可强化",
            fontSize = 11,
            fontColor = C.textSub,
            whiteSpace = "normal",
            lineHeight = 1.5,
            width = "100%",
            height = 34,
            flexShrink = 0,
        })

        -- 徽章列表
        for i = 1, #Badges.LIST do
            table.insert(cards, BadgeCard(state, Badges.LIST[i], function(id)
                local ok, msg = Badges.upgrade(state, id)
                UI.Toast.Show(msg, {
                    duration = 2,
                    variant = ok and "success" or "warning",
                    position = "top",
                })
                if ok then
                    Audio.Play("levelup")
                    Career.save()
                end
                refresh()
            end))
        end

        return cards
    end

    refresh = function()
        UI.SetRoot(ScreenBadge.Build(onBack))
    end

    return Common.Screen(Config.ART.bgTrainingRoom, {
        Common.TopBar("徽 章 墙", function()
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
                    gap = 12,
                    padding = 16,
                    paddingBottom = 28,
                    children = buildList(),
                },
            },
        },
    })
end

return ScreenBadge
