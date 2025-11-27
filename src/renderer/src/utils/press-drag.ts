// press-drag.ts
import type { DirectiveBinding } from 'vue'

interface Point { x: number, y: number }
interface DragState {
  start: Point
  last: Point
  current: Point
  totalDx: number
  totalDy: number
  duration: number // 从按下到当前的毫秒数
  longPressed: boolean
  dragging: boolean
}

interface Handlers {
  onClick?: (ev: PointerEvent) => void
  onLongPress?: (ev: PointerEvent, state: DragState) => void
  onDragStart?: (ev: PointerEvent, state: DragState) => void
  onDrag?: (ev: PointerEvent, state: DragState) => void
  onDragEnd?: (ev: PointerEvent, state: DragState) => void
  // Hover & right-click
  onHoverEnter?: (ev: MouseEvent) => void
  onHoverLeave?: (ev: MouseEvent) => void
  onRightClick?: (ev: MouseEvent) => void
  // 配置
  longPressMs?: number // 默认 500ms
  moveTolerance?: number // 判定点击/进入拖动的位移阈值，默认 6px
  preventContextMenu?: boolean // 移动端长按不弹系统菜单，默认 true
  preventRightClickMenu?: boolean // 是否屏蔽右键系统菜单，默认 false
}

interface Store {
  opts: Required<Pick<Handlers, 'longPressMs' | 'moveTolerance' | 'preventContextMenu' | 'preventRightClickMenu'>> & Omit<Handlers, 'longPressMs' | 'moveTolerance' | 'preventContextMenu' | 'preventRightClickMenu'>
  pressTimer: number | null
  downAt: number
  start: Point | null
  last: Point | null
  dragging: boolean
  longPressed: boolean
  movedBeyondTolerance: boolean
  suppressNextClick: boolean
  cleanup?: () => void
}

const KEY = Symbol('press-drag')

function now() {
  return (performance || Date).now()
}

function getPoint(ev: PointerEvent): Point {
  return { x: ev.screenX, y: ev.screenY }
}

function distance(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export const vPressDrag = {
  mounted(el: HTMLElement, binding: DirectiveBinding<Handlers>) {
    const opts: Store['opts'] = {
      ...binding.value,
      longPressMs: binding.value?.longPressMs ?? 500,
      moveTolerance: binding.value?.moveTolerance ?? 6,
      preventContextMenu: binding.value?.preventContextMenu ?? true,
      preventRightClickMenu: binding.value?.preventRightClickMenu ?? false,
    }

    const st: Store = {
      opts,
      pressTimer: null,
      downAt: 0,
      start: null,
      last: null,
      dragging: false,
      longPressed: false,
      movedBeyondTolerance: false,
      suppressNextClick: false,
    }

    // 为了在 pointerup 后阻止“原生 click”冒泡（长按或拖动后不算点击）
    const clickBlocker = (ev: MouseEvent) => {
      if (st.suppressNextClick) {
        ev.stopImmediatePropagation()
        ev.preventDefault()
        st.suppressNextClick = false
      }
    }
    el.addEventListener('click', clickBlocker, true)

    // Hover handlers
    const onMouseEnter = (ev: MouseEvent) => {
      st.opts.onHoverEnter?.(ev)
    }
    const onMouseLeave = (ev: MouseEvent) => {
      st.opts.onHoverLeave?.(ev)
    }
    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('mouseleave', onMouseLeave)

    // Right click / context menu
    const onContextMenu = (ev: MouseEvent) => {
      if (st.opts.preventRightClickMenu)
        ev.preventDefault()
      st.opts.onRightClick?.(ev)
    }
    el.addEventListener('contextmenu', onContextMenu)

    const onPointerDown = (ev: PointerEvent) => {
      // 仅左键/触控
      if (ev.button !== 0 && ev.pointerType === 'mouse')
        return

      el.setPointerCapture?.(ev.pointerId)
      st.downAt = now()
      st.start = getPoint(ev)
      st.last = st.start
      st.dragging = false
      st.longPressed = false
      st.movedBeyondTolerance = false

      if (st.opts.preventContextMenu) {
        // 阻止长按呼出系统菜单（移动端）
        const preventMenu = (e: Event) => e.preventDefault()
        el.addEventListener('contextmenu', preventMenu, { once: true })
        // 也可以加 touch-action CSS：touch-action: none;
      }

      // 启动长按计时器
      if (st.pressTimer)
        clearTimeout(st.pressTimer)
      st.pressTimer = window.setTimeout(() => {
        st.longPressed = true
        const state: DragState = {
          start: st.start!,
          last: st.last!,
          current: st.last!,
          totalDx: (st.last!.x - st.start!.x),
          totalDy: (st.last!.y - st.start!.y),
          duration: now() - st.downAt,
          longPressed: true,
          dragging: st.dragging,
        }
        st.opts.onLongPress?.(ev, state)
        // 触发过长按后，后续的原生 click 应该被抑制
        st.suppressNextClick = true
      }, st.opts.longPressMs)
    }

    const onPointerMove = (ev: PointerEvent) => {
      if (!st.start)
        return
      const pt = getPoint(ev)
      const last = st.last ?? pt
      st.last = pt

      if (!st.movedBeyondTolerance && distance(st.start, pt) > st.opts.moveTolerance) {
        st.movedBeyondTolerance = true
      }

      // 进入拖动态（只要越过阈值就算拖动，与是否已长按无关）
      if (!st.dragging && st.movedBeyondTolerance) {
        st.dragging = true
        // 拖动一旦开始，就不要再触发 click
        st.suppressNextClick = true
        // 长按计时器仍可继续，允许“边拖边长按”按需触发
        const state: DragState = {
          start: st.start,
          last,
          current: pt,
          totalDx: (pt.x - st.start.x),
          totalDy: (pt.y - st.start.y),
          duration: now() - st.downAt,
          longPressed: st.longPressed,
          dragging: true,
        }
        st.opts.onDragStart?.(ev, state)
      }

      if (st.dragging) {
        const state: DragState = {
          start: st.start,
          last,
          current: pt,
          totalDx: (pt.x - st.start.x),
          totalDy: (pt.y - st.start.y),
          duration: now() - st.downAt,
          longPressed: st.longPressed,
          dragging: true,
        }
        st.opts.onDrag?.(ev, state)
      }
    }

    const finish = (ev: PointerEvent) => {
      if (st.pressTimer) {
        clearTimeout(st.pressTimer)
        st.pressTimer = null
      }
      const isClick = !st.longPressed && !st.dragging && !st.movedBeyondTolerance
      if (isClick) {
        st.opts.onClick?.(ev)
        // 点击后不需要抑制 click
      }
      else {
        // 长按或拖动结束都抑制原生 click
        st.suppressNextClick = true
      }

      if (st.dragging) {
        const pt = st.last ?? (st.start as Point)
        const state: DragState = {
          start: st.start!,
          last: pt,
          current: pt,
          totalDx: (pt.x - st.start!.x),
          totalDy: (pt.y - st.start!.y),
          duration: now() - st.downAt,
          longPressed: st.longPressed,
          dragging: false,
        }
        st.opts.onDragEnd?.(ev, state)
      }

      st.start = null
      st.last = null
      st.dragging = false
      st.longPressed = false
      st.movedBeyondTolerance = false
      el.releasePointerCapture?.((ev as PointerEvent).pointerId)
    }

    const onPointerUp = (ev: PointerEvent) => {
      if (!st.start)
        return
      finish(ev)
    }
    const onPointerCancel = (ev: PointerEvent) => {
      if (!st.start)
        return
      finish(ev)
    }
    const onLostCapture = (ev: PointerEvent) => {
      if (!st.start)
        return
      finish(ev)
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    el.addEventListener('lostpointercapture', onLostCapture)

    st.cleanup = () => {
      el.removeEventListener('click', clickBlocker, true)
      el.removeEventListener('mouseenter', onMouseEnter)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      el.removeEventListener('lostpointercapture', onLostCapture)
    }

    ;(el as unknown as Record<symbol, Store>)[KEY] = st
  },

  updated(el: HTMLElement, binding: DirectiveBinding<Handlers>) {
    // 更新配置
    const st: Store | undefined = (el as unknown as Record<symbol, Store>)[KEY]
    if (!st)
      return
    st.opts = {
      longPressMs: binding.value?.longPressMs ?? st.opts.longPressMs,
      moveTolerance: binding.value?.moveTolerance ?? st.opts.moveTolerance,
      preventContextMenu: binding.value?.preventContextMenu ?? st.opts.preventContextMenu,
      preventRightClickMenu: binding.value?.preventRightClickMenu ?? st.opts.preventRightClickMenu,
      ...binding.value,
    }
  },

  unmounted(el: HTMLElement) {
    const st: Store | undefined = (el as unknown as Record<symbol, Store>)[KEY]
    st?.cleanup?.()
    delete (el as unknown as Record<symbol, Store>)[KEY]
  },
}
