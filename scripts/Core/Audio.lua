-- ============================================================================
-- Audio — 音效与背景音乐管理
-- 音效走 SoundSource，BGM 走 looped SoundSource
-- ============================================================================

local Config = require("Core.Config")

local Audio = {}

-- 音效节点（挂在场景根下）
---@type Node|nil
local sfxNode_ = nil
-- BGM 节点
---@type Node|nil
local bgmNode_ = nil
---@type SoundSource|nil
local bgmSource_ = nil
-- 当前 BGM 名
---@type string
local currentBgm_ = ""
-- 音量
local sfxVolume_ = 0.7
local bgmVolume_ = 0.35
-- 静音开关（设置页控制）
local sfxMuted_ = false
local bgmMuted_ = false
-- 音效缓存
---@type table<string, Sound>
local sfxCache_ = {}

-- ---------------------------------------------------------------------------
-- 初始化
-- ---------------------------------------------------------------------------
---@param scene Scene
function Audio.Init(scene)
    sfxNode_ = scene:CreateChild("SfxNode")
    bgmNode_ = scene:CreateChild("BgmNode")
    bgmSource_ = bgmNode_:CreateComponent("SoundSource")
    if bgmSource_ then
        bgmSource_.soundType = "MUSIC"
    end
    print("[Audio] 初始化完成")
end

-- ---------------------------------------------------------------------------
-- 音效
-- ---------------------------------------------------------------------------
--- 播放一次音效
---@param key string Config.SFX 的键
---@param gain number|nil 音量倍数（默认 1.0）
function Audio.Play(key, gain)
    if not sfxNode_ then return end
    local path = Config.SFX[key]
    if not path then
        print("[Audio] 未找到音效: " .. tostring(key))
        return
    end

    local sound = sfxCache_[key]
    if not sound then
        sound = cache:GetResource("Sound", path)
        if not sound then
            print("[Audio] 音效加载失败: " .. path)
            return
        end
        sfxCache_[key] = sound
    end

    if sfxMuted_ then return end   -- 静音时不创建音源，避免无谓开销

    local src = sfxNode_:CreateComponent("SoundSource")
    if not src then return end
    src.soundType = "EFFECT"
    src.autoRemoveMode = REMOVE_COMPONENT
    -- frequency 传 0 = 使用素材采样率
    src:Play(sound, 0, sfxVolume_ * (gain or 1.0))
end

-- ---------------------------------------------------------------------------
-- 背景音乐
-- ---------------------------------------------------------------------------
--- 切换 BGM（同一首重复调用不会重启）
---@param key string "daily" | "battle"
function Audio.PlayBgm(key)
    if not bgmSource_ then return end
    if currentBgm_ == key then return end

    local path = Config.BGM[key]
    if not path then return end

    local sound = cache:GetResource("Sound", path)
    if not sound then
        print("[Audio] BGM 加载失败: " .. path)
        return
    end

    sound.looped = true
    bgmSource_:Stop()
    -- 静音时仍记录曲目，但以 0 音量播放，取消静音即可续上
    bgmSource_:Play(sound, 0, bgmMuted_ and 0 or bgmVolume_)
    currentBgm_ = key
    print("[Audio] 切换 BGM: " .. key)
end

--- 停止 BGM
function Audio.StopBgm()
    if bgmSource_ then
        bgmSource_:Stop()
    end
    currentBgm_ = ""
end

--- 设置音量
---@param sfx number 0-1
---@param bgm number 0-1
function Audio.SetVolume(sfx, bgm)
    sfxVolume_ = sfx
    bgmVolume_ = bgm
    if bgmSource_ and bgmSource_.playing then
        bgmSource_.gain = bgmVolume_
    end
end

--- 获取音量
---@return number, number
function Audio.GetVolume()
    return sfxVolume_, bgmVolume_
end

-- ---------------------------------------------------------------------------
-- 静音开关（设置页使用）
-- ---------------------------------------------------------------------------
--- 设置静音
---@param sfxMuted boolean
---@param bgmMuted boolean
function Audio.SetMuted(sfxMuted, bgmMuted)
    sfxMuted_ = sfxMuted and true or false
    bgmMuted_ = bgmMuted and true or false
    if bgmSource_ then
        if bgmMuted_ then
            bgmSource_.gain = 0
        elseif bgmSource_.playing then
            bgmSource_.gain = bgmVolume_
        end
    end
    print(string.format("[Audio] 静音设置 音效=%s 音乐=%s",
        tostring(sfxMuted_), tostring(bgmMuted_)))
end

--- 获取静音状态
---@return boolean, boolean
function Audio.GetMuted()
    return sfxMuted_, bgmMuted_
end

--- 静音状态下 Play 应传 0
---@return number
function Audio.sfxGainMul()
    return sfxMuted_ and 0 or 1
end

return Audio
