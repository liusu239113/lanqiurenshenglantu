-- ============================================================================
-- ScreenCreate — 创建球员界面（三步向导）
--
--   第 1 步 球员档案：姓名 / 场上位置 / 出身地
--   第 2 步 星途出身：4 选 1；「天选之星」需要看一段短片解锁（弹窗式，玩家主动点）
--   第 3 步 天赋卡  ：初始报告抽 6 张选 3 张；重拟需主动看广告
--                     也可以看广告「重拟报告（保底 2 张传奇）」或「全部带走」
--
-- 广告点位说明：第 2、3 步各自独立成屏，不选完上一步就看不到下一步的广告，
-- 不存在"一屏塞满广告按钮"的情况。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Teams = require("Data.Teams")
local Audio = require("Core.Audio")
local Common = require("UI.Common")
local Anim = require("UI.Anim")
local AdWidgets = require("UI.AdWidgets")

local ScreenCreate = {}

local C = Config.COLORS

-- ---------------------------------------------------------------------------
-- 建角流程状态
-- ---------------------------------------------------------------------------

---@class CreateDraft
---@field step number              当前步骤 1-3
---@field name string
---@field posIndex number
---@field townIndex number
---@field originId string
---@field chosenConfirmed boolean   本次建角观看广告后已解锁天选之星
---@field adRerolls number          本次建角已观看重拟报告广告次数
---@field adAll boolean             本次建角已观看全部带走广告
---@field allCards boolean          本次报告可带走全部卡牌
---@field cards TalentDef[]         当前抽到的 6 张卡
---@field picked table<string, boolean> 已选中的卡 id
---@field modal string|nil          当前弹窗："chosen" | nil
---@field animIndex number|nil      翻牌动画的错峰序号（<0 = 不播放）
---@field playAnim boolean|nil       本次渲染是否播放翻牌动画

---@type CreateDraft|nil
local draft_ = nil

--- 取第一条出身定义（配置保证非空）
---@return OriginDef
local function firstOrigin()
    local def = Config.ORIGINS[1]
    if not def then
        error("Config.ORIGINS 不能为空")
    end
    return def
end

--- 取最后一条出身定义（约定：广告解锁的强力出身放在末尾）
---@return OriginDef
local function lastOrigin()
    local def = Config.ORIGINS[#Config.ORIGINS]
    if not def then
        error("Config.ORIGINS 不能为空")
    end
    return def
end

--- 取第 index 个位置定义（配置保证非空）
---@param index number
---@return PositionDef
local function positionDef(index)
    local def = Config.POSITIONS[index]
    if not def then
        error(string.format("Config.POSITIONS[%d] 不存在", index))
    end
    return def
end

--- 开一份新的建角草稿
---@return CreateDraft
local function newDraft()
    ---@type CreateDraft
    return {
        step = 1,
        name = "林越",
        posIndex = 2,
        townIndex = 1,
        originId = firstOrigin().id,
        chosenConfirmed = false,
        adRerolls = 0,
        adAll = false,
        allCards = false,
        cards = {},
        picked = {},
        modal = nil,
    }
end

-- ---------------------------------------------------------------------------
-- 抽卡
-- ---------------------------------------------------------------------------

--- 按权重掷一个稀有度
---@return string
local function rollRarity()
    local w = Config.TALENT_WEIGHT
    local legend = w.legend or 0
    local silver = w.silver or 0
    local bronze = w.bronze or 0
    local total = legend + silver + bronze
    if total <= 0 then return "bronze" end

    local r = math.random() * total
    if r < legend then return "legend" end
    if r < legend + silver then return "silver" end
    return "bronze"
end

--- 抽 Config.TALENT.drawCount 张不重复的天赋卡
---@return TalentDef[]
local function drawCards(guaranteedLegends)
    ---@type TalentDef[]
    local result = {}
    ---@type table<string, boolean>
    local used = {}

    --- 从指定稀有度（nil = 不限）里取一张没抽过的
    ---@param rarity string|nil
    ---@return TalentDef|nil
    local function take(rarity)
        ---@type TalentDef[]
        local cands = {}
        for i = 1, #Config.TALENTS do
            local t = Config.TALENTS[i]
            if not used[t.id] and (rarity == nil or t.rarity == rarity) then
                table.insert(cands, t)
            end
        end
        if #cands == 0 then return nil end
        local pick = cands[math.random(1, #cands)]
        if not pick then return nil end
        used[pick.id] = true
        return pick
    end

    local guarantees = guaranteedLegends or 0
    for i = 1, guarantees do
        local legend = take("legend")
        if legend then table.insert(result, legend) end
    end

    -- 按权重抽，权重抽空则全池兜底
    local guard = 0
    while #result < Config.TALENT.drawCount and guard < 100 do
        guard = guard + 1
        local t = take(rollRarity()) or take(nil)
        if t then table.insert(result, t) end
    end

    return result
end

--- 重抽一套卡（清空已选）
---@param draft CreateDraft
local function reroll(draft, guaranteedLegends)
    draft.cards = drawCards(guaranteedLegends)
    draft.picked = {}
    draft.allCards = false
    draft.playAnim = true   -- 新一套卡 → 重播翻牌动画
end

--- 已选张数
---@param draft CreateDraft
---@return number
local function pickedCount(draft)
    local n = 0
    for i = 1, #draft.cards do
        local card = draft.cards[i]
        if draft.picked[card.id] then n = n + 1 end
    end
    return n
end

--- 本轮可以带走的张数
---@param draft CreateDraft
---@return number
local function targetCount(draft)
    return draft.allCards and #draft.cards or Config.TALENT.pickCount
end

-- ---------------------------------------------------------------------------
-- 数值预览
-- ---------------------------------------------------------------------------

--- 取当前选中的出身定义
---@param draft CreateDraft
---@return OriginDef
local function currentOrigin(draft)
    for i = 1, #Config.ORIGINS do
        if Config.ORIGINS[i].id == draft.originId then
            return Config.ORIGINS[i]
        end
    end
    return firstOrigin()
end

--- 属性加成文案，例如「得分 +2 · 体能 +4」
---@param bonus table<string, number?>|nil
---@return string
local function bonusText(bonus)
    if not bonus then return "" end
    ---@type string[]
    local parts = {}
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        local v = bonus[def.key]
        if v then
            table.insert(parts, string.format("%s +%d", def.name, v))
        end
    end
    return table.concat(parts, " · ")
end

--- 计算当前草稿的属性预览（位置基准 + 出身 + 已选天赋卡）
---@param draft CreateDraft
---@return table<string, number>
local function previewAttrs(draft)
    ---@type table<string, number>
    local attrs = {}
    local focus = positionDef(draft.posIndex).focus
    for i = 1, #Config.ATTRS do
        local def = Config.ATTRS[i]
        attrs[def.key] = focus[def.key] or 25
    end

    --- 把一份加成叠上去
    ---@param bonus table<string, number?>|nil
    local function apply(bonus)
        if not bonus then return end
        for i = 1, #Config.ATTRS do
            local def = Config.ATTRS[i]
            local add = bonus[def.key]
            if add then
                attrs[def.key] = (attrs[def.key] or 0) + add
            end
        end
    end

    apply(currentOrigin(draft).attrs)
    for i = 1, #draft.cards do
        local card = draft.cards[i]
        if draft.picked[card.id] then
            apply(card.attrs)
        end
    end
    return attrs
end

--- 当前预览综合评分
---@param draft CreateDraft
---@return number
local function previewOverall(draft)
    local attrs = previewAttrs(draft)
    return math.floor(Career.attrAverage(attrs) + 0.5)
end

--- 当前综合评分小条（让玩家看到选择带来的变化）
---@param draft CreateDraft
---@return Panel
local function OverallBanner(draft)
    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        alignItems = "center",
        justifyContent = "space-between",
        padding = 10,
        backgroundColor = C.bgCardLight,
        borderWidth = 2,
        borderColor = C.outline,
        children = {
            UI.Label {
                text = "当前综合评分",
                fontSize = 12,
                fontWeight = "bold",
                fontColor = C.textSub,
            },
            UI.Label {
                text = tostring(previewOverall(draft)),
                fontSize = 22,
                fontWeight = "bold",
                fontColor = C.primary,
            },
        },
    }
end

--- 步骤指示条
---@param step number
---@return Panel
local function StepBar(step)
    local names = { "球员档案", "星途出身", "天赋卡" }
    ---@type table[]
    local items = {}
    for i = 1, #names do
        local active = (i == step)
        local done = (i < step)
        table.insert(items, UI.Panel {
            flexGrow = 1,
            flexBasis = 0,
            flexDirection = "column",
            alignItems = "center",
            gap = 3,
            paddingVertical = 6,
            backgroundColor = active and C.primary or (done and C.bgCardLight or C.bgPanel),
            borderWidth = 2,
            borderColor = C.outline,
            children = {
                UI.Label {
                    text = tostring(i),
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = active and { 255, 255, 255, 255 } or C.textSub,
                },
                UI.Label {
                    text = names[i],
                    fontSize = 11,
                    fontWeight = "bold",
                    fontColor = active and { 255, 255, 255, 255 } or C.textSub,
                },
            },
        })
    end
    return UI.Panel {
        width = "100%",
        flexDirection = "row",
        gap = 6,
        children = items,
    }
end

-- ---------------------------------------------------------------------------
-- 第 1 步：球员档案
-- ---------------------------------------------------------------------------

--- 构建第 1 步的内容
---@param draft CreateDraft
---@return table[]
local function BuildStep1(draft)
    ---@type Panel|nil
    local attrPreview = nil
    ---@type table[]
    local posButtons = {}
    ---@type Label|nil
    local posDescLabel = nil
    ---@type table[]
    local townButtons = {}

    --- 刷新属性预览
    local function renderPreview()
        if not attrPreview then return end
        attrPreview:ClearChildren()
        local attrs = previewAttrs(draft)
        for i = 1, #Config.ATTRS do
            local def = Config.ATTRS[i]
            attrPreview:AddChild(Common.AttrRow(def, attrs[def.key] or 0))
        end
    end

    --- 刷新位置按钮外观
    local function refreshPos()
        for i = 1, #posButtons do
            local btn = posButtons[i]
            if i == draft.posIndex then
                btn:SetStyle({ backgroundColor = C.primary, textColor = { 255, 255, 255, 255 } })
            else
                btn:SetStyle({ backgroundColor = C.bgCardLight, textColor = C.textMain })
            end
        end
        if posDescLabel then
            posDescLabel:SetText(positionDef(draft.posIndex).desc)
        end
    end

    --- 刷新出身地按钮外观
    local function refreshTown()
        for i = 1, #townButtons do
            local btn = townButtons[i]
            if i == draft.townIndex then
                btn:SetStyle({ backgroundColor = C.secondary, textColor = { 255, 255, 255, 255 } })
            else
                btn:SetStyle({ backgroundColor = C.bgCardLight, textColor = C.textMain })
            end
        end
    end

    local nameField = UI.TextField {
        text = draft.name,
        placeholder = "输入球员姓名",
        width = "100%",
        height = 48,
        fontSize = 16,
        onChange = function(_, value)
            draft.name = value
        end,
    }

    for i = 1, #Config.POSITIONS do
        local pos = positionDef(i)
        local idx = i
        posButtons[i] = UI.Button {
            text = pos.short,
            flexGrow = 1,
            flexBasis = 0,
            height = 44,
            fontSize = 14,
            fontWeight = "bold",
            borderWidth = 3,
            borderColor = C.outline,
            onClick = function()
                Audio.Play("click")
                draft.posIndex = idx
                refreshPos()
                renderPreview()
            end,
        }
    end

    posDescLabel = UI.Label {
        text = positionDef(draft.posIndex).desc,
        fontSize = 12,
        fontColor = C.textSub,
        textAlign = "center",
        whiteSpace = "normal",
        height = 34,
    }

    for i = 1, #Teams.HOMETOWNS do
        local town = Teams.HOMETOWNS[i]
        local idx = i
        townButtons[i] = UI.Button {
            text = town,
            width = 76,
            height = 40,
            fontSize = 13,
            fontWeight = "bold",
            borderWidth = 3,
            borderColor = C.outline,
            onClick = function()
                Audio.Play("click")
                draft.townIndex = idx
                refreshTown()
            end,
        }
    end

    attrPreview = UI.Panel {
        flexDirection = "column",
        gap = 8,
    }

    -- 初始化状态（必须在按钮创建之后调用）
    refreshPos()
    refreshTown()
    renderPreview()

    return {
        Common.Block("球 员 姓 名", { nameField }, { barColor = C.primary }),
        Common.Block("场 上 位 置", {
            UI.Panel { flexDirection = "row", gap = 8, children = posButtons },
            posDescLabel,
        }, { barColor = C.secondary }),
        Common.Block("出 身 地", {
            UI.Panel { flexDirection = "row", flexWrap = "wrap", gap = 8, children = townButtons },
        }, { barColor = { 168, 62, 148, 255 } }),
        Common.Block("起 始 能 力", {
            Common.Sub("位置决定底子，出身和天赋卡会在此基础上叠加", 11),
            attrPreview,
        }, { barColor = C.textMain }),
    }
end

-- ---------------------------------------------------------------------------
-- 第 2 步：星途出身
-- ---------------------------------------------------------------------------

--- 单张出身卡
---@param draft CreateDraft
---@param def OriginDef
---@param onLockedCard fun() 点了未解锁的卡
---@param onPick fun()       选中了这张卡
---@return Button
local function OriginCard(draft, def, onLockedCard, onPick)
    local selected = (def.id == draft.originId)
    local needsConfirm = def.id == "chosen" and not draft.chosenConfirmed

    --- 加成文案
    ---@type string[]
    local lines = {}
    local at = bonusText(def.attrs)
    if at ~= "" then table.insert(lines, at) end
    if def.init then
        if def.init.fame then table.insert(lines, string.format("人气 %+d", def.init.fame)) end
        if def.init.money then table.insert(lines, string.format("存款 %+d 万", def.init.money)) end
        if def.init.morale then table.insert(lines, string.format("士气 %+d", def.init.morale)) end
    end
    -- 独特机制（perk）单独成行展示，不与数值加成挤在同一行

    ---@type table[]
    local titleRow = {
        UI.Label {
            text = def.name,
            fontSize = 18,
            fontWeight = "bold",
            fontColor = selected and { 255, 255, 255, 255 } or C.textMain,
            letterSpacing = 1,
        },
    }
    if selected then
        table.insert(titleRow, Common.Tag("已选", C.primaryDark))
    end
    if needsConfirm then
        table.insert(titleRow, Common.Tag("看广告解锁", { 232, 168, 32, 255 }))
    end

    ---@type table[]
    local children = {
        UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 5,
            alignItems = "flex-start",
            children = {
                UI.Panel {
                    flexDirection = "row",
                    alignItems = "center",
                    gap = 8,
                    children = titleRow,
                },
                UI.Label {
                    text = def.tagline,
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = selected and { 255, 236, 232, 240 } or C.secondary,
                    whiteSpace = "normal",
                },
                UI.Label {
                    text = def.desc,
                    fontSize = 12,
                    fontColor = selected and { 255, 240, 236, 230 } or C.textSub,
                    whiteSpace = "normal",
                    lineHeight = 1.4,
                },
                UI.Label {
                    text = table.concat(lines, "  |  "),
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = selected and { 255, 255, 255, 255 } or C.success,
                    whiteSpace = "normal",
                },
                -- 独特机制单独一行，用区别于数值的颜色强调「这是玩法差异，不只是数字」
                def.perk and UI.Label {
                    text = "◆ " .. def.perk.name .. "：" .. def.perk.desc,
                    fontSize = 12,
                    fontWeight = "bold",
                    fontColor = selected and { 255, 240, 180, 255 } or { 196, 120, 16, 255 },
                    whiteSpace = "normal",
                } or UI.Panel { width = 0, height = 0 },
            },
        },
    }
    if needsConfirm then
        table.insert(children, UI.Label {
            text = "▶ 点这里查看代价",
            fontSize = 11,
            fontWeight = "bold",
            fontColor = { 232, 168, 32, 255 },
        })
    end

    -- 高度按内容量计算（Button 的 minHeight 不生效，必须给确定 height）：
    -- perk 行 +22，锁定卡的解锁提示行 +22
    local cardHeight = 150
    if def.perk then cardHeight = cardHeight + 22 end
    if needsConfirm then cardHeight = cardHeight + 22 end

    return UI.Button {
        width = "100%",
        height = cardHeight,
        paddingHorizontal = 14,
        paddingVertical = 12,
        backgroundColor = selected and C.primary or C.bgCard,
        hoverBackgroundColor = selected and C.primary or C.bgCardLight,
        pressedBackgroundColor = selected and C.primaryDark or C.bgCardLight,
        borderWidth = 3,
        borderColor = C.outline,
        disabled = selected,
        onClick = function()
            Audio.Play("click")
            if needsConfirm then
                onLockedCard()
                return
            end
            onPick()
        end,
        children = children,
    }
end

--- 构建第 2 步内容
---@param draft CreateDraft
---@param onLockedClick fun()
---@return table[], fun() 内容块 + 列表就地刷新函数
local function BuildStep2(draft, onLockedClick)
    local list = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 12,
    }

    --- 重建出身卡列表（就地刷新，保留滚动位置）
    local function refresh()
        list:ClearChildren()
        for i = 1, #Config.ORIGINS do
            local def = Config.ORIGINS[i]
            list:AddChild(OriginCard(draft, def, onLockedClick, function()
                draft.originId = def.id
                refresh()
            end))
        end
    end

    refresh()

    local origin = currentOrigin(draft)
    local hint = Common.Sub(string.format("当前出身：%s — %s", origin.name, origin.tagline), 12)

    return {
        Common.Sub("同一名球员，走的是哪条路，起点就不一样。选一条你的来路。", 13),
        OverallBanner(draft),
        list,
        hint,
    }, refresh
end

-- ---------------------------------------------------------------------------
-- 第 3 步：天赋卡
-- ---------------------------------------------------------------------------

--- 单张天赋卡按钮
---@param draft CreateDraft
---@param card TalentDef
---@param onToggle fun()
---@return Button
local function TalentCardButton(draft, card, onToggle)
    local taken = draft.picked[card.id] == true
    local rarityColor = Config.TALENT_RARITY_COLOR[card.rarity] or C.textSub
    local rarityName = Config.TALENT_RARITY_NAME[card.rarity] or card.rarity

    ---@type table[]
    local rightChildren = {}
    if taken then
        table.insert(rightChildren, UI.Label {
            text = "√ 已选",
            fontSize = 13,
            fontWeight = "bold",
            fontColor = { 255, 255, 255, 255 },
        })
    end

    local btn = UI.Button {
        width = "100%",
        height = 76,
        paddingHorizontal = 12,
        backgroundColor = taken and C.primary or C.bgCard,
        hoverBackgroundColor = taken and C.primaryLight or C.bgCardLight,
        pressedBackgroundColor = taken and C.primaryDark or C.bgCardLight,
        borderWidth = 3,
        borderColor = C.outline,
        onClick = function()
            onToggle()
        end,
        children = {
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                alignItems = "center",
                gap = 10,
                children = {
                    -- 稀有度竖条
                    UI.Panel {
                        width = 8,
                        height = 48,
                        flexShrink = 0,
                        backgroundColor = rarityColor,
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
                                        text = card.name,
                                        fontSize = 16,
                                        fontWeight = "bold",
                                        fontColor = taken and { 255, 255, 255, 255 } or C.textMain,
                                    },
                                    Common.Tag(rarityName, rarityColor),
                                },
                            },
                            UI.Label {
                                text = card.desc,
                                fontSize = 12,
                                fontColor = taken and { 255, 240, 236, 230 } or C.textSub,
                                whiteSpace = "normal",
                            },
                        },
                    },
                    UI.Panel {
                        flexDirection = "column",
                        alignItems = "flex-end",
                        flexShrink = 0,
                        children = rightChildren,
                    },
                },
            },
        },
    }

    -- 翻牌入场：卡片由小放大弹出（高稀有度带一次光效脉冲）
    -- animIndex < 0 表示本次不播放（点选/取消导致的列表重建）
    local idx = draft.animIndex or -1
    if idx < 0 then
        return btn
    end

    -- 用 SetProp 设置 scale（直接赋值 scale 会与 Node.scale 的 Vector2 类型冲突）
    btn:SetProp("scale", 0.8)
    btn:SetOpacity(0)
    local isRare = (card.rarity == "legend")
    local delay = 0.07 * idx

    Anim.Delay(delay, function()
        Anim.Float(0.8, 1.0, 0.28, Anim.Ease.outBack, function(v)
            btn:SetProp("scale", v)
            btn:SetOpacity(math.min(1, (v - 0.8) * 5))
        end, function()
            btn:SetProp("scale", 1.0)
            btn:SetOpacity(1)
            -- 高稀有度：弹出后一次强调脉冲
            if isRare then
                Anim.Float(1.0, 1.07, 0.15, Anim.Ease.outQuad, function(v)
                    btn:SetProp("scale", v)
                end, function()
                    Anim.Float(1.07, 1.0, 0.18, Anim.Ease.outQuad, function(v)
                        btn:SetProp("scale", v)
                    end, function()
                        btn:SetProp("scale", 1.0)
                    end)
                end)
            end
        end)
    end)

    return btn
end

-- ---------------------------------------------------------------------------
-- 主构建函数
-- ---------------------------------------------------------------------------

--- 构建建角界面
---@param onDone fun(name: string, positionId: string, hometown: string, originId: string, talentIds: string[])
---@param onBack fun()
---@return Panel
function ScreenCreate.Build(onDone, onBack)
    Audio.PlayBgm("create")

    draft_ = newDraft()
    reroll(draft_)

    ---@type fun(): Panel
    local render

    --- 打开弹窗
    ---@param kind string
    local function openModal(kind)
        local draft = draft_
        if not draft then return end
        draft.modal = kind
        render()
    end

    --- 选用「天选之星」出身：只在激励广告完整观看的回调里调用。
    local function unlockChosen()
        local draft = draft_
        if not draft then return end
        local origin = lastOrigin()
        draft.chosenConfirmed = true
        draft.originId = origin.id
        draft.modal = nil
        Audio.Play("levelup")
        UI.Toast.Show(string.format("已选用出身【%s】", origin.name),
            { duration = 2.5, variant = "success", position = "top" })
        render()
    end

    --- 渲染整个界面
    render = function()
        local draft = draft_
        if not draft then
            return UI.Panel { width = "100%", height = "100%" }
        end

        -- 选中天选之星必须先通过广告回调解锁。
        if draft.originId == "chosen" and not draft.chosenConfirmed then
            draft.originId = firstOrigin().id
        end
        local isLast = (draft.step == 3)

        -- ---- 底部主按钮（先建，便于第 3 步就地刷新状态）----
        local canNext = (not isLast) or (pickedCount(draft) >= targetCount(draft))
        ---@type Button
        local nextBtn = UI.Button {
            text = isLast and "开 始 生 涯" or "下 一 步",
            flexGrow = 1,
            flexBasis = 0,
            height = 52,
            fontSize = 16,
            fontWeight = "bold",
            backgroundColor = canNext and C.primary or { 210, 200, 184, 255 },
            textColor = canNext and { 255, 255, 255, 255 } or { 150, 140, 126, 255 },
            borderWidth = 3,
            borderColor = C.outline,
            letterSpacing = 2,
            disabled = not canNext,
            onClick = function()
                Audio.Play("click")
                if draft.step < 3 then
                    draft.step = draft.step + 1
                    render()
                    return
                end
                Audio.Play("click")
                local town = Teams.HOMETOWNS[draft.townIndex] or "临江"
                local pos = positionDef(draft.posIndex)
                ---@type string[]
                local talentIds = {}
                for i = 1, #draft.cards do
                    local card = draft.cards[i]
                    if draft.picked[card.id] then
                        table.insert(talentIds, card.id)
                    end
                end
                onDone(draft.name, pos.id, town, draft.originId, talentIds)
            end,
        }

        -- ---- 内容块 ----
        ---@type table[]
        local blocks = {}
        ---@type fun()|nil
        local stepRefresh = nil
        ---@type fun()|nil
        local footerSync = nil

        if draft.step == 1 then
            local s1 = BuildStep1(draft)
            for i = 1, #s1 do table.insert(blocks, s1[i]) end

        elseif draft.step == 2 then
            local s2, refresh2 = BuildStep2(draft, function() openModal("chosen") end)
            for i = 1, #s2 do table.insert(blocks, s2[i]) end
            stepRefresh = refresh2

        else
            -- 卡列表容器 + 计数标签（就地刷新，避免每次点卡都回到顶部）
            local list = UI.Panel {
                width = "100%",
                flexDirection = "column",
                gap = 10,
            }
            local counter = Common.Sub("", 12)

            --- 同步底部状态
            local function refreshFooter()
                counter:SetText(string.format("已选 %d / %d 张", pickedCount(draft), targetCount(draft)))
                nextBtn:SetDisabled(pickedCount(draft) < targetCount(draft))
            end

            --- 重建卡列表
            local function renderCards()
                list:ClearChildren()
                for i = 1, #draft.cards do
                    local card = draft.cards[i]
                    -- 错峰翻牌序号；仅在重新抽卡时播放，点选/取消重建时不重播
                    draft.animIndex = draft.playAnim and (i - 1) or -1
                    list:AddChild(TalentCardButton(draft, card, function()
                        Audio.Play("click")
                        if draft.picked[card.id] then
                            draft.picked[card.id] = nil
                        else
                            if pickedCount(draft) >= targetCount(draft) then
                                UI.Toast.Show(
                                    string.format("最多只能带走 %d 张，先取消一张", targetCount(draft)),
                                    { duration = 2, variant = "warning", position = "top" })
                                return
                            end
                            draft.picked[card.id] = true
                        end
                        renderCards()
                        refreshFooter()
                    end))
                end
                refreshFooter()
            end

            footerSync = refreshFooter

            -- 球探报告通过广告重拟，普通三选一仍可直接开始生涯。
            ---@type table[]
            local controls = {}
            if draft.adRerolls < Config.AD_REWARDS.talentRerollSeason and not draft.adAll then
                table.insert(controls, AdWidgets.Button(nil, "talentReroll", function()
                    draft.adRerolls = draft.adRerolls + 1
                    reroll(draft, Config.TALENT.adLegendCount)
                    return "球探重拟完成：6 张卡保底 2 张传奇"
                end, { label = string.format("▶ 看广告 · 重拟报告（保底 2 张传奇，剩 %d 次）",
                    Config.AD_REWARDS.talentRerollSeason - draft.adRerolls), onFinished = render }))
            end
            if not draft.adAll then
                table.insert(controls, AdWidgets.Button(nil, "talentAll", function()
                    draft.adAll = true
                    draft.allCards = true
                    for i = 1, #draft.cards do
                        draft.picked[draft.cards[i].id] = true
                    end
                    return "本轮 6 张天赋卡已全部带走"
                end, { label = "▶ 看广告 · 本轮 6 张天赋卡全部带走", onFinished = render }))
            end

            blocks = {
                Common.Sub("球探把你叫到一边：「挑几样绝活，让所有人记住你。」", 13),
                OverallBanner(draft),
                Common.Block("球 探 报 告", controls, { barColor = { 232, 168, 32, 255 } }),
                list,
                counter,
            }

            renderCards()
        end

        -- ---- 底部按钮 ----
        ---@type table[]
        local bottomChildren = {
            UI.Panel {
                width = "100%",
                flexDirection = "row",
                gap = 10,
                children = {
                    UI.Button {
                        text = "上 一 步",
                        width = 104,
                        height = 52,
                        fontSize = 14,
                        fontWeight = "bold",
                        backgroundColor = C.bgCard,
                        textColor = C.textMain,
                        borderWidth = 3,
                        borderColor = C.outline,
                        onClick = function()
                            Audio.Play("click")
                            if draft.step > 1 then
                                draft.step = draft.step - 1
                                render()
                            else
                                onBack()
                            end
                        end,
                    },
                    nextBtn,
                },
            },
        }

        -- ---- 弹窗层 ----
        ---@type table[]
        local overlays = {}
        if draft.modal == "chosen" then
            local origin = lastOrigin()
            table.insert(overlays, UI.Panel {
                position = "absolute",
                top = 0, left = 0, right = 0, bottom = 0,
                flexDirection = "row",
                justifyContent = "center",
                alignItems = "center",
                backgroundColor = { 26, 22, 20, 200 },
                paddingHorizontal = 20,
                children = {
                    UI.Panel {
                        width = "100%",
                        maxWidth = Common.CONTENT_MAX_W,
                        flexDirection = "column",
                        backgroundColor = C.bgCard,
                        borderWidth = 3,
                        borderColor = C.outline,
                        overflow = "hidden",
                        children = {
                            Common.Bar(string.format("解 锁 「%s」", origin.name), { 232, 168, 32, 255 }),
                            UI.Panel {
                                width = "100%",
                                flexDirection = "column",
                                gap = 14,
                                padding = 18,
                                children = {
                                    UI.Label {
                                        text = "这个出身的收益很高，代价也很实在。看清楚再决定。",
                                        fontSize = 13,
                                        fontColor = C.textMain,
                                        whiteSpace = "normal",
                                        lineHeight = 1.6,
                                    },
                                    UI.Label {
                                        text = string.format("%s  |  人气 +%d  |  士气 %+d",
                                            bonusText(origin.attrs),
                                            origin.init and origin.init.fame or 0,
                                            origin.init and origin.init.morale or 0),
                                        fontSize = 12,
                                        fontWeight = "bold",
                                        fontColor = C.success,
                                        whiteSpace = "normal",
                                    },
                                    AdWidgets.Button(nil, "chosen", function()
                                        unlockChosen()
                                        return "天选之星已解锁并选用"
                                    end, { label = "▶ 看广告 · 解锁天选之星（人气 +300，士气 -15）", onFinished = render }),
                                    Common.OutlineButton("再 想 想", function()
                                        Audio.Play("click")
                                        draft.modal = nil
                                        render()
                                    end),
                                },
                            },
                        },
                    },
                },
            })
        end

        local root = Common.Screen(Config.ART.bgOffice, {
            Common.TopBar("创 建 球 员", function()
                Audio.Play("click")
                if draft.step > 1 then
                    draft.step = draft.step - 1
                    render()
                else
                    onBack()
                end
            end),
            UI.Panel {
                width = "100%",
                paddingHorizontal = 16,
                paddingTop = 12,
                children = { StepBar(draft.step) },
            },
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
                        children = blocks,
                    },
                },
            },
            UI.Panel {
                width = "100%",
                padding = 14,
                backgroundColor = C.bgPanel,
                borderTopWidth = 3,
                borderTopColor = C.outline,
                children = bottomChildren,
            },
        }, { dim = 0.6 })

        for i = 1, #overlays do
            root:AddChild(overlays[i])
        end

        UI.SetRoot(root)
        if stepRefresh then stepRefresh() end
        if footerSync then footerSync() end
        return root
    end

    return render()
end

return ScreenCreate
