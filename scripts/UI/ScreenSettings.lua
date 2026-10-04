-- ============================================================================
-- ScreenSettings — 设置页
--
-- 此前 Audio.SetVolume 定义了但全项目 0 调用，玩家无法调音量或静音，
-- 这是移动游戏的基本功能缺失。本页补齐音量滑杆 + 静音开关 + 存档操作。
-- ============================================================================

local UI = require("urhox-libs/UI")
local Config = require("Core.Config")
local Career = require("Core.Career")
local Audio = require("Core.Audio")
local Common = require("UI.Common")

local ScreenSettings = {}

local C = Config.COLORS

-- 设置持久化到独立小文件（与主存档解耦，避免互相影响）
local SETTINGS_FILE = "basketball_career_settings.json"

-- 默认设置
local DEFAULT = { sfx = 0.7, bgm = 0.35, sfxMuted = false, bgmMuted = false }

--- 读取设置
---@return table
local function loadSettings()
    -- 首次运行没有设置文件是正常情况，先判存在再打开（否则引擎会打 ERROR 日志）
    if not fileSystem:FileExists(SETTINGS_FILE) then
        return { sfx = DEFAULT.sfx, bgm = DEFAULT.bgm,
                 sfxMuted = DEFAULT.sfxMuted, bgmMuted = DEFAULT.bgmMuted }
    end

    local f = File(SETTINGS_FILE, FILE_READ)
    if not f:IsOpen() then
        return { sfx = DEFAULT.sfx, bgm = DEFAULT.bgm,
                 sfxMuted = DEFAULT.sfxMuted, bgmMuted = DEFAULT.bgmMuted }
    end
    local text = f:ReadString()
    f:Close()

    local cjson = require("cjson")
    local ok, data = pcall(cjson.decode, text)
    if not ok or type(data) ~= "table" then
        return { sfx = DEFAULT.sfx, bgm = DEFAULT.bgm,
                 sfxMuted = DEFAULT.sfxMuted, bgmMuted = DEFAULT.bgmMuted }
    end
    return {
        sfx = tonumber(data.sfx) or DEFAULT.sfx,
        bgm = tonumber(data.bgm) or DEFAULT.bgm,
        sfxMuted = data.sfxMuted and true or false,
        bgmMuted = data.bgmMuted and true or false,
    }
end

--- 写入设置
---@param t table
local function saveSettings(t)
    local cjson = require("cjson")
    local f = File(SETTINGS_FILE, FILE_WRITE)
    if not f:IsOpen() then
        print("[Settings] 写入失败")
        return
    end
    f:WriteString(cjson.encode(t))
    f:Flush()
    f:Close()
end

--- 应用设置到 Audio
---@param t table
local function applySettings(t)
    Audio.SetVolume(t.sfx, t.bgm)
    Audio.SetMuted(t.sfxMuted, t.bgmMuted)
end

--- 启动时调用：把已保存的设置应用到 Audio
function ScreenSettings.LoadAndApply()
    local t = loadSettings()
    applySettings(t)
    print(string.format("[Settings] 已应用：音效 %.2f 音乐 %.2f 静音(音效=%s 音乐=%s)",
        t.sfx, t.bgm, tostring(t.sfxMuted), tostring(t.bgmMuted)))
    return t
end

-- ---------------------------------------------------------------------------
-- 构建
-- ---------------------------------------------------------------------------

--- 构建设置页
---@param onBack fun()
---@return Panel
function ScreenSettings.Build(onBack)
    local s = loadSettings()
    local refresh

    refresh = function()
        UI.SetRoot(ScreenSettings.Build(onBack))
    end

    -- 音量行
    ---@param label string
    ---@param key string
    local function volumeRow(label, key)
        local mutedKey = key .. "Muted"
        local muted = s[mutedKey]
        return UI.Panel {
            width = "100%",
            flexDirection = "column",
            gap = 6,
            padding = 12,
            borderWidth = 3,
            borderColor = C.outline,
            backgroundColor = C.bgCardLight,
            children = {
                UI.Panel {
                    width = "100%",
                    flexDirection = "row",
                    alignItems = "center",
                    justifyContent = "space-between",
                    children = {
                        UI.Label {
                            text = label,
                            fontSize = 15,
                            fontWeight = "bold",
                            fontColor = C.textMain,
                        },
                        UI.Label {
                            text = muted and "已静音" or string.format("%d%%", math.floor(s[key] * 100)),
                            fontSize = 13,
                            fontWeight = "bold",
                            fontColor = muted and C.danger or C.textSub,
                        },
                    },
                },
                UI.Slider {
                    width = "100%",
                    value = math.floor(s[key] * 100),
                    min = 0,
                    max = 100,
                    disabled = muted,
                    onChange = function(_, v)
                        s[key] = v / 100
                        applySettings(s)
                        saveSettings(s)
                    end,
                },
                UI.Button {
                    width = "100%",
                    height = 40,
                    fontSize = 13,
                    text = muted and ("取消" .. label .. "静音") or (label .. "静音"),
                    variant = muted and "primary" or "ghost",
                    borderWidth = 3,
                    borderColor = C.outline,
                    onClick = function()
                        s[mutedKey] = not muted
                        applySettings(s)
                        saveSettings(s)
                        Audio.Play("click")
                        UI.Toast.Show(s[mutedKey] and (label .. "已静音") or (label .. "已开启"),
                            { duration = 1.5, variant = "info", position = "top" })
                        refresh()
                    end,
                },
            },
        }
    end

    ---@type table[]
    local children = {
        Common.TopBar("设 置", function()
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
                        Common.Block("音 频", {
                            volumeRow("音效音量", "sfx"),
                            volumeRow("音乐音量", "bgm"),
                        }, { barColor = C.secondary }),

                        Common.Block("操 作 说 明", {
                            Common.Sub("· 训练馆：投篮/突破/防守三种玩法，考验时机与判断", 12),
                            Common.Sub("· 比赛：操作模式逐回合对抗；文字直播快速推进", 12),
                            Common.Sub("· 主页底部可随时切换比赛模式", 12),
                            Common.Sub("· 每周只能安排一次行动，推进一周后刷新", 12),
                        }),

                    },
                },
            },
        },
    }

    return Common.Screen(Config.ART.bgLocker, children, { dim = 0.55 })
end

return ScreenSettings
