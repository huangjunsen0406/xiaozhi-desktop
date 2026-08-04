<script setup lang="ts">
import type { AppStateSnapshot, BubbleLocalShowPayload, ServerMessage } from '@shared/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

/** 气泡文案最大宽度（与视觉样式一致）；与宠物窗宽度无关 */
const BUBBLE_MAX_WIDTH = 320
/** 内容区 padding（水平/垂直） */
const BUBBLE_PAD_X = 12
const BUBBLE_PAD_Y = 8
/** 箭头三角高度 */
const BUBBLE_ARROW_H = 6
/** 内容字号 / 行高（与 CSS 同步，供 offscreen 测量） */
const BUBBLE_FONT_SIZE = 13
const BUBBLE_LINE_HEIGHT = 1.4
const BUBBLE_MAX_LINES = 3
/**
 * 高度安全余量：中文行盒/亚像素/圆角阴影常比 offscreen probe 高 1–3px。
 * 宁可略松，也不要因 BrowserWindow 客户区矮 1px 触发文档级竖向滚动条。
 */
const BUBBLE_HEIGHT_SAFETY_PX = 4
/**
 * 宽度安全余量：font/subpixel/setContentSize 常比 nowrap probe 窄 1–几 px，
 * 若窗宽偏短再叠加 word-break，CJK 短状态（「聆听中...」）会逐字竖排。
 */
const BUBBLE_WIDTH_SAFETY_PX = 10
/** 测量防抖 */
const MEASURE_DEBOUNCE_MS = 50
/** 本地提醒默认展示时长 */
const LOCAL_REMINDER_DEFAULT_MS = 5000

const bubbleText = ref('')
/** 箭头相对气泡窗口左缘的 X（主进程 edge-clamp 后下发）；null = 居中 */
const arrowX = ref<number | null>(null)
const bubbleRootRef = ref<HTMLDivElement | null>(null)
/**
 * 单行固有宽 ≤ 320 时强制 nowrap（「连接中...」「聆听中...」等绝不可竖断）。
 * 超长文案走多行 + overflow-wrap。
 */
const isSingleLineBubble = ref(true)

/**
 * 当前气泡来源：
 * - session：设备状态 / 服务端 TTS·LLM（优先）
 * - local：关怀提醒等本地通道
 * idle 时仅清 session；local 可独立展示
 */
type BubbleSource = 'session' | 'local' | null
let bubbleSource: BubbleSource = null

let removeStateListener: (() => void) | null = null
let removeMessageListener: (() => void) | null = null
let removeArrowListener: (() => void) | null = null
let removeLocalShowListener: (() => void) | null = null
let removeLocalHideListener: (() => void) | null = null
let bubbleTimer: ReturnType<typeof setTimeout> | null = null
let measureTimer: ReturnType<typeof setTimeout> | null = null
/** 上次已上报尺寸，避免同文案重复 IPC */
let lastReportedW = 0
let lastReportedH = 0

/**
 * 箭头在窗内滑动（相对 BrowserWindow 客户区），不平移整张卡片。
 * 窗宽由文案固有宽度决定，与 pets/live2d 窗宽无关。
 */
const arrowStyle = computed(() => {
  if (arrowX.value === null)
    return { left: '50%' }
  return { left: `${arrowX.value}px` }
})

/**
 * 不受当前窗宽/宠物窗宽约束的固有尺寸测量。
 * 避免：初始窄窗 → 文案竖排 → getBoundingClientRect 锁死窄宽 → 永久截断。
 *
 * 必须先 nowrap 量单行固有宽：
 * - ≤320：上报 singleLineW + 宽度 safety，并标记 singleLine（CSS nowrap）
 * - >320：固定 320 量多行高度（overflow-wrap，禁止 break-all 逐字竖断）
 */
function measureIntrinsicBubbleSize(text: string): {
  width: number
  height: number
  singleLine: boolean
} | null {
  if (!text)
    return null

  const fontStack = 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Fira Sans","Droid Sans","Helvetica Neue",sans-serif'
  const baseStyle = [
    'position:absolute',
    'visibility:hidden',
    'pointer-events:none',
    'left:-99999px',
    'top:0',
    'box-sizing:border-box',
    `padding:${BUBBLE_PAD_Y}px ${BUBBLE_PAD_X}px`,
    `font-size:${BUBBLE_FONT_SIZE}px`,
    `line-height:${BUBBLE_LINE_HEIGHT}`,
    `font-family:${fontStack}`,
    '-webkit-font-smoothing:antialiased',
  ].join(';')

  const probe = document.createElement('div')
  probe.textContent = text
  // 1) 单行固有宽（横向 pill），与宠物窗宽无关
  probe.style.cssText = `${baseStyle};width:max-content;white-space:nowrap;`
  document.body.appendChild(probe)
  const singleLineW = Math.ceil(probe.offsetWidth)
  const fitsSingleLine = singleLineW <= BUBBLE_MAX_WIDTH
  // 单行：+ safety，避免 setContentSize 略窄触发 wrap；多行：cap 320
  const width = fitsSingleLine
    ? Math.max(1, singleLineW + BUBBLE_WIDTH_SAFETY_PX)
    : BUBBLE_MAX_WIDTH

  // 2) 按最终策略量高度
  if (fitsSingleLine) {
    probe.style.cssText = [
      baseStyle,
      `width:${width}px`,
      'white-space:nowrap',
      'overflow:hidden',
    ].join(';')
  }
  else {
    probe.style.cssText = [
      baseStyle,
      `width:${width}px`,
      'white-space:normal',
      'word-break:normal',
      'overflow-wrap:break-word',
      'line-break:auto',
      'display:-webkit-box',
      `-webkit-line-clamp:${BUBBLE_MAX_LINES}`,
      '-webkit-box-orient:vertical',
      'overflow:hidden',
    ].join(';')
  }
  // offsetHeight 已含 padding；ceil 后再加 safety，避免 setBounds 矮 1–2px 出滚动条
  const contentHeight = Math.max(1, Math.ceil(probe.offsetHeight))
  document.body.removeChild(probe)

  return {
    width,
    height: contentHeight + BUBBLE_ARROW_H + BUBBLE_HEIGHT_SAFETY_PX,
    singleLine: fitsSingleLine,
  }
}

/**
 * 上报气泡固有内容尺寸（仅由文案决定，绝不参考宠物窗宽）。
 * 主进程 setBounds 紧包后，再 positionBubbleAbove 相对宠物中心贴合。
 */
function reportBubbleContentSize(): void {
  const text = bubbleText.value
  if (!text)
    return

  const measured = measureIntrinsicBubbleSize(text)
  if (!measured)
    return

  isSingleLineBubble.value = measured.singleLine

  if (measured.width === lastReportedW && measured.height === lastReportedH)
    return

  lastReportedW = measured.width
  lastReportedH = measured.height
  window.api.bubbleSetContentSize('bubble', {
    width: measured.width,
    height: measured.height,
  })
}

function scheduleBubbleMeasure(): void {
  if (measureTimer)
    clearTimeout(measureTimer)
  // 等 Transition / 布局完成后再量，避免 thrash
  measureTimer = setTimeout(() => {
    measureTimer = null
    reportBubbleContentSize()
  }, MEASURE_DEBOUNCE_MS)
}

function clearBubbleTimer(): void {
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
}

/**
 * 显示气泡文字
 * @param text 展示文案
 * @param autoHideMs 自动隐藏毫秒；0 表示不自动隐藏
 * @param source session 优先于 local；session 展示中 local 不抢占
 */
function showBubble(
  text: string,
  autoHideMs = 0,
  source: Exclude<BubbleSource, null> = 'session',
): void {
  // 会话气泡优先：本地提醒不打断正在展示的 session 文案
  if (source === 'local' && bubbleSource === 'session' && bubbleText.value)
    return

  clearBubbleTimer()
  // 新文案强制重新测量
  if (text !== bubbleText.value) {
    lastReportedW = 0
    lastReportedH = 0
  }
  bubbleSource = source
  bubbleText.value = text
  if (autoHideMs > 0) {
    bubbleTimer = setTimeout(() => {
      // 仅清当前这次展示
      if (bubbleSource === source) {
        bubbleText.value = ''
        bubbleSource = null
      }
      bubbleTimer = null
    }, autoHideMs)
  }
}

/**
 * 隐藏气泡
 */
function hideBubble(onlySource?: Exclude<BubbleSource, null>): void {
  if (onlySource && bubbleSource !== onlySource)
    return
  clearBubbleTimer()
  bubbleText.value = ''
  bubbleSource = null
  lastReportedW = 0
  lastReportedH = 0
}

/**
 * 处理设备状态变更（会话气泡；idle 不杀本地提醒）
 */
function handleStateChanged(state: AppStateSnapshot): void {
  const deviceState = state.deviceState
  if (deviceState === 'idle') {
    hideBubble('session')
  }
  else if (deviceState === 'connecting') {
    showBubble('连接中...', 0, 'session')
  }
  else if (deviceState === 'listening') {
    showBubble('聆听中...', 0, 'session')
  }
  // speaking 状态下等服务器消息内容填充
}

/**
 * 处理服务器消息（获取 AI 回复文字）
 */
function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'tts' && message.state === 'sentence_start' && message.text) {
    showBubble(message.text, 5000, 'session')
  }
  else if (message.type === 'llm' && message.text) {
    showBubble(message.text, 5000, 'session')
  }
}

/**
 * 本地关怀提醒：不要求 deviceState；session 优先
 */
function handleLocalShow(payload: BubbleLocalShowPayload): void {
  if (!payload.text)
    return
  const ms = payload.durationMs && payload.durationMs > 0
    ? payload.durationMs
    : LOCAL_REMINDER_DEFAULT_MS
  showBubble(payload.text, ms, 'local')
}

// 监听 bubbleText 变化，经 preload 通知主进程显示/隐藏气泡窗口
watch(bubbleText, (newVal) => {
  if (newVal) {
    // 文案一到立刻按固有尺寸上报（与宠物窗宽无关），再 show 定位
    reportBubbleContentSize()
    window.api.bubbleShow()
    scheduleBubbleMeasure()
  }
  else {
    window.api.bubbleHide()
  }
})

onMounted(() => {
  removeStateListener = window.api.appOnStateChanged(handleStateChanged)
  removeMessageListener = window.api.appOnServerMessage(handleServerMessage)
  // 主进程下发箭头位置：只滑动箭头，不 remeasure（避免反馈环）
  removeArrowListener = window.api.bubbleOnSetArrowX((x) => {
    arrowX.value = x
  })
  removeLocalShowListener = window.api.bubbleOnShowLocal(handleLocalShow)
  removeLocalHideListener = window.api.bubbleOnHideLocal(() => {
    hideBubble('local')
  })
})

onUnmounted(() => {
  if (removeStateListener) {
    removeStateListener()
    removeStateListener = null
  }
  if (removeMessageListener) {
    removeMessageListener()
    removeMessageListener = null
  }
  if (removeArrowListener) {
    removeArrowListener()
    removeArrowListener = null
  }
  if (removeLocalShowListener) {
    removeLocalShowListener()
    removeLocalShowListener = null
  }
  if (removeLocalHideListener) {
    removeLocalHideListener()
    removeLocalHideListener = null
  }
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
  if (measureTimer) {
    clearTimeout(measureTimer)
    measureTimer = null
  }
})
</script>

<template>
  <div class="bubble-container">
    <Transition name="bubble" @after-enter="scheduleBubbleMeasure">
      <div
        v-if="bubbleText"
        ref="bubbleRootRef"
        class="bubble"
      >
        <div
          class="bubble-content"
          :class="{ 'bubble-content--single': isSingleLineBubble }"
        >
          {{ bubbleText }}
        </div>
        <!-- 占位箭头高度；可见箭头绝对定位在 container 底边，left 用窗级 arrowX -->
        <div class="bubble-arrow-space" aria-hidden="true" />
      </div>
    </Transition>
    <div
      v-if="bubbleText"
      class="bubble-arrow"
      :style="arrowStyle"
    />
  </div>
</template>

<style scoped>
/*
 * 内容级窗：容器 = 整窗客户区。
 * 气泡水平居中贴底；窗宽只由文案固有宽度驱动（max 320），与宠物窗宽无关。
 * 箭头相对窗口滑动，不把整张卡片 translate 出窗外。
 *
 * 本窗是独立 BrowserWindow，仅加载 #/bubble；可安全锁 html/body 防文档滚动条。
 * 全局 tailwind body { min-height:100vh } 在紧包 setBounds 时极易因 1px 溢出出现右侧细滚动条。
 */
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  min-height: 0; /* 覆盖全局 body min-height:100vh，避免紧包窗被撑出文档滚动 */
  max-height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}

/* 彻底隐藏本窗任何滚动条（含 macOS overlay / classic） */
:global(html),
:global(body),
:global(#app),
.bubble-container,
.bubble,
.bubble-content {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

:global(html::-webkit-scrollbar),
:global(body::-webkit-scrollbar),
:global(#app::-webkit-scrollbar),
.bubble-container::-webkit-scrollbar,
.bubble::-webkit-scrollbar,
.bubble-content::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.bubble-container {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: transparent;
  pointer-events: none;
  overflow: hidden;
}

.bubble {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  /* 占满内容级窗宽（已是文案固有宽），避免 max-content 在窄客户区再次塌缩 */
  width: 100%;
  max-width: 100%;
  z-index: 1;
  overflow: hidden;
}

.bubble-content {
  box-sizing: border-box;
  /* 窗宽已是文案固有宽（主进程 pad=0），内容铺满即可，勿再被 100% 窄窗二次挤扁 */
  width: 100%;
  max-width: 100%;
  background: white;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.4;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  /* 多行截断用 hidden；禁止 auto/scroll，否则会出现右侧细滚动条 */
  overflow: hidden;
  /* 禁止 break-all：CJK 短状态会在窗宽偏窄时逐字竖排成「聆 / 听 / 中...」 */
  word-break: normal;
  overflow-wrap: break-word;
  line-break: auto;
}

/* 单行固有宽 ≤320：强制横向 pill（连接中/聆听中等状态绝不可竖断） */
.bubble-content--single {
  display: block;
  -webkit-line-clamp: unset;
  -webkit-box-orient: unset;
  white-space: nowrap;
  word-break: normal;
  overflow-wrap: normal;
}

:global(.dark) .bubble-content {
  color: #ddd;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* 为绝对定位箭头预留高度，避免内容与箭头重叠 */
.bubble-arrow-space {
  width: 100%;
  height: 6px;
  flex-shrink: 0;
}

/* 箭头相对气泡窗口客户区定位（arrowX 由主进程按宠物中心 + edge clamp 计算） */
.bubble-arrow {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid white;
  transform: translateX(-50%);
  z-index: 2;
  pointer-events: none;
}

:global(.dark) .bubble-arrow {
  border-top-color: #2a2a2a;
}

/* 淡入淡出：仅垂直位移，水平由 flex 居中 */
.bubble-enter-active,
.bubble-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
