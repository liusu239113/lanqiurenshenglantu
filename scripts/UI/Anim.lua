-- ============================================================================
-- Anim — 轻量补间动画辅助
--
-- 引擎 UI 库没有内置 tween，而全项目此前几乎零动效（切屏硬切、得分跳变、
-- 抽卡无翻牌）。本模块提供最小可用的补间能力，由 main.lua 的 Update 驱动。
--
-- 用法：
--   Anim.To(target, { 属性 = 终值 }, 时长, 缓动, 完成回调)
--   Anim.Float(起点, 终点, 时长, 缓动, 每帧回调, 完成回调)
--   Anim.Delay(秒, 回调)
-- ============================================================================

local Anim = {}

-- ---------------------------------------------------------------------------
-- 缓动函数
-- ---------------------------------------------------------------------------
Anim.Ease = {
    linear = function(t) return t end,
    outQuad = function(t) return 1 - (1 - t) * (1 - t) end,
    inQuad = function(t) return t * t end,
    outCubic = function(t) return 1 - (1 - t) ^ 3 end,
    inOutQuad = function(t)
        if t < 0.5 then return 2 * t * t end
        return 1 - (-2 * t + 2) ^ 2 / 2
    end,
    -- 回弹（适合弹窗出现、得分飘字）
    outBack = function(t)
        local c1, c3 = 1.70158, 2.70158
        return 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2
    end,
    -- 弹性（适合强调）
    outElastic = function(t)
        if t == 0 or t == 1 then return t end
        local c4 = (2 * math.pi) / 3
        return 2 ^ (-10 * t) * math.sin((t * 10 - 0.75) * c4) + 1
    end,
}

-- ---------------------------------------------------------------------------
-- 活动补间列表
-- ---------------------------------------------------------------------------
---@class Tween
---@field elapsed number
---@field duration number
---@field ease fun(t: number): number
---@field onUpdate fun(t: number)
---@field onDone fun()|nil

---@type Tween[]
local active_ = {}

--- 通用补间
---@param duration number 秒
---@param ease fun(t: number): number
---@param onUpdate fun(t: number) 每帧回调，t 为缓动后的进度 0-1
---@param onDone fun()|nil
---@return Tween
function Anim.Tween(duration, ease, onUpdate, onDone)
    local tw = {
        elapsed = 0,
        duration = math.max(0.0001, duration),
        ease = ease or Anim.Ease.linear,
        onUpdate = onUpdate,
        onDone = onDone,
    }
    table.insert(active_, tw)
    return tw
end

--- 数值补间（最常用）
---@param from number
---@param to number
---@param duration number
---@param ease fun(t: number): number|nil
---@param onUpdate fun(v: number)
---@param onDone fun()|nil
function Anim.Float(from, to, duration, ease, onUpdate, onDone)
    return Anim.Tween(duration, ease or Anim.Ease.outQuad, function(t)
        onUpdate(from + (to - from) * t)
    end, onDone)
end

--- 延时执行
---@param seconds number
---@param fn fun()
function Anim.Delay(seconds, fn)
    return Anim.Tween(seconds, Anim.Ease.linear, function() end, fn)
end

--- 每帧推进（由 main.lua Update 调用）
---@param dt number
function Anim.Update(dt)
    if #active_ == 0 then return end

    -- 倒序遍历，便于安全移除
    for i = #active_, 1, -1 do
        local tw = active_[i]
        tw.elapsed = tw.elapsed + dt

        local raw = tw.elapsed / tw.duration
        if raw >= 1 then
            tw.onUpdate(tw.ease(1))
            if tw.onDone then tw.onDone() end
            table.remove(active_, i)
        else
            tw.onUpdate(tw.ease(raw))
        end
    end
end

--- 清空所有补间（切屏时调用，避免回调操作已销毁的控件）
function Anim.Clear()
    active_ = {}
end

--- 当前活动补间数（调试用）
---@return number
function Anim.Count()
    return #active_
end

return Anim
