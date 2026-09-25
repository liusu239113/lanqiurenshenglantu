-- ============================================================================
-- ScreenCreate — 创建球员界面（姓名 / 位置 / 出身地）
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Teams = require("Data.Teams")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenCreate = {}

local C = Config.COLORS

--- 构建建角界面
---@param onDone fun(name: string, positionId: string, hometown: string)
---@param onBack fun()
---@return Panel
function ScreenCreate.Build(onDone, onBack)
    Audio.PlayBgm("daily")

    -- 表单状态
    local name = "林越"
    local posIndex = 2      -- 默认得分后卫
    local townIndex = 1

    -- ---- 前向声明 ----
    ---@type Panel|nil
    local attrPreview = nil
    ---@type table[]
    local posButtons = {}
    ---@type Label|nil
    local posDescLabel = nil
    ---@type table[]
    local townButtons = {}

    --- 渲染属性预览
    ---@param attrs table<string, number>
    local function renderPreview(attrs)
        if not attrPreview then return end
        attrPreview:ClearChildren()
        for i = 1, #Config.ATTRS do
            local def = Config.ATTRS[i]
            attrPreview:AddChild(Common.AttrRow(def, attrs[def.key] or 0))
        end
    end

    --- 用位置基准值生成预览数据
    ---@param idx number
    local function previewFromPosition(idx)
        ---@type table<string, number>
        local preview = {}
        local focus = Config.POSITIONS[idx].focus
        for i = 1, #Config.ATTRS do
            local def = Config.ATTRS[i]
            preview[def.key] = focus[def.key] or 25
        end
        renderPreview(preview)
    end

    --- 刷新位置按钮外观（选中=橙红白字，未选=浅米底深字）
    local function refreshPos()
        for i = 1, #posButtons do
            local btn = posButtons[i]
            if i == posIndex then
                btn:SetStyle({
                    backgroundColor = C.primary,
                    textColor = { 255, 255, 255, 255 },
                })
            else
                btn:SetStyle({
                    backgroundColor = C.bgCardLight,
                    textColor = C.textMain,
                })
            end
        end
        if posDescLabel then
            posDescLabel:SetText(Config.POSITIONS[posIndex].desc)
        end
    end

    --- 刷新出身地按钮外观
    local function refreshTown()
        for i = 1, #townButtons do
            local btn = townButtons[i]
            if i == townIndex then
                btn:SetStyle({
                    backgroundColor = C.secondary,
                    textColor = { 255, 255, 255, 255 },
                })
            else
                btn:SetStyle({
                    backgroundColor = C.bgCardLight,
                    textColor = C.textMain,
                })
            end
        end
    end

    -- ---- 姓名输入 ----
    local nameField = UI.TextField {
        text = name,
        placeholder = "输入球员姓名",
        width = "100%",
        height = 48,
        fontSize = 16,
        onChange = function(_, value)
            name = value
        end,
    }

    -- ---- 位置按钮 ----
    for i = 1, #Config.POSITIONS do
        local pos = Config.POSITIONS[i]
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
                posIndex = idx
                refreshPos()
                previewFromPosition(idx)
            end,
        }
    end

    posDescLabel = UI.Label {
        text = Config.POSITIONS[posIndex].desc,
        fontSize = 12,
        fontColor = C.textSub,
        textAlign = "center",
        whiteSpace = "normal",
        height = 34,
    }

    -- ---- 出身地按钮 ----
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
                townIndex = idx
                refreshTown()
            end,
        }
    end

    -- ---- 属性预览容器 ----
    attrPreview = UI.Panel {
        flexDirection = "column",
        gap = 8,
    }

    -- ---- 滚动内容 ----
    local scrollContent = UI.Panel {
        width = "100%",
        flexDirection = "column",
        gap = 14,
        padding = 20,
        paddingBottom = 30,
        children = {
            Common.Block("球 员 姓 名", { nameField }, { barColor = C.primary }),
            Common.Block("场 上 位 置", {
                UI.Panel {
                    flexDirection = "row",
                    gap = 8,
                    children = posButtons,
                },
                posDescLabel,
            }, { barColor = C.secondary }),
            Common.Block("出 身 地", {
                UI.Panel {
                    flexDirection = "row",
                    flexWrap = "wrap",
                    gap = 8,
                    children = townButtons,
                },
            }, { barColor = { 168, 62, 148, 255 } }),
            Common.Block("起 始 能 力", {
                Common.Sub("根据位置自动生成，附带少量随机浮动", 11),
                attrPreview,
            }, { barColor = C.textMain }),
        },
    }

    local root = Common.Screen(Config.ART.bgLocker, {
        -- 顶栏（返回键在左上角）
        Common.TopBar("创 建 球 员", function()
            Audio.Play("click")
            onBack()
        end),

        -- 滚动内容
        UI.ScrollView {
            flexGrow = 1,
            flexBasis = 0,
            scrollY = true,
            showScrollbar = true,
            children = { scrollContent },
        },

        -- 底部按钮
        UI.Panel {
            padding = 18,
            children = {
                Common.PrimaryButton("开 始 生 涯", function()
                    Audio.Play("whistle")
                    local town = Teams.HOMETOWNS[townIndex] or "临江"
                    local pos = Config.POSITIONS[posIndex]
                    onDone(name, pos.id, town)
                end),
            },
        },
    }, { dim = 0.6 })

    refreshPos()
    refreshTown()
    previewFromPosition(posIndex)

    return root
end

return ScreenCreate
