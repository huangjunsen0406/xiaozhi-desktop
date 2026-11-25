import type { DirectiveBinding } from 'vue'

export interface PressDragHandlers {
  onClick?: (ev: PointerEvent) => void
  onDragStart?: (ev: PointerEvent) => void
  onDrag?: (ev: PointerEvent) => void
  onDragEnd?: (ev: PointerEvent) => void
  onHoverEnter?: (ev: MouseEvent) => void
  onHoverLeave?: (ev: MouseEvent) => void
  moveTolerance?: number
  preventRightClickMenu?: boolean
}

const CLEANUP_KEY = Symbol('press-drag-cleanup')

export const vPressDrag = {
  mounted(el: HTMLElement, binding: DirectiveBinding<PressDragHandlers>) {
    const opts = binding.value ?? {}
    const tolerance = opts.moveTolerance ?? 6

    let startX = 0
    let startY = 0
    let active = false
    let dragging = false
    let suppressNextClick = false

    const clickBlocker = (ev: MouseEvent): void => {
      if (!suppressNextClick)
        return
      ev.stopImmediatePropagation()
      ev.preventDefault()
      suppressNextClick = false
    }

    const onMouseEnter = (ev: MouseEvent): void => opts.onHoverEnter?.(ev)
    const onMouseLeave = (ev: MouseEvent): void => opts.onHoverLeave?.(ev)
    const onContextMenu = (ev: MouseEvent): void => {
      if (opts.preventRightClickMenu)
        ev.preventDefault()
    }

    const onPointerDown = (ev: PointerEvent): void => {
      if (ev.button !== 0 && ev.pointerType === 'mouse')
        return
      el.setPointerCapture?.(ev.pointerId)
      startX = ev.screenX
      startY = ev.screenY
      active = true
      dragging = false
    }

    const onPointerMove = (ev: PointerEvent): void => {
      if (!active)
        return
      if (!dragging && Math.hypot(ev.screenX - startX, ev.screenY - startY) > tolerance) {
        dragging = true
        suppressNextClick = true
        opts.onDragStart?.(ev)
      }
      if (dragging)
        opts.onDrag?.(ev)
    }

    const finish = (ev: PointerEvent): void => {
      if (!active)
        return
      if (dragging) {
        suppressNextClick = true
        opts.onDragEnd?.(ev)
      }
      else {
        opts.onClick?.(ev)
      }
      active = false
      dragging = false
      el.releasePointerCapture?.(ev.pointerId)
    }

    el.addEventListener('click', clickBlocker, true)
    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', finish)
    el.addEventListener('lostpointercapture', finish)

    ;(el as unknown as Record<symbol, () => void>)[CLEANUP_KEY] = () => {
      el.removeEventListener('click', clickBlocker, true)
      el.removeEventListener('mouseenter', onMouseEnter)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
      el.removeEventListener('lostpointercapture', finish)
    }
  },

  unmounted(el: HTMLElement) {
    const store = el as unknown as Record<symbol, (() => void) | undefined>
    store[CLEANUP_KEY]?.()
    delete store[CLEANUP_KEY]
  },
}
