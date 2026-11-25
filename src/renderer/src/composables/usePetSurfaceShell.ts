import type { Ref } from 'vue'
import { clampPetDisplayWidth, PET_DISPLAY_WIDTH_DEFAULT } from '@shared/types'
import { onUnmounted, ref } from 'vue'
import { useAppStore } from '../stores/app'

export interface PetSurfaceShellOptions {
  surface: 'live2d' | 'pets'
  isHit: (e: MouseEvent) => boolean
  onDisplayWidthChange?: (width: number) => void
  onHoverEnter?: (e: MouseEvent) => void
  onHoverMove?: (e: MouseEvent) => void
  onHoverLeave?: () => void
  onDragStart?: (e: MouseEvent) => void
  onDragMove?: (e: MouseEvent) => void
  onDragEnd?: (e: MouseEvent) => void
}

export interface PetSurfaceShell {
  displayWidthPx: Ref<number>
  isDragging: () => boolean
  setClickThrough: (ignore: boolean) => void
  initDisplayWidth: () => Promise<number>
  handlers: {
    mousedown: (e: MouseEvent) => void
    mouseenter: (e: MouseEvent) => void
    mousemove: (e: MouseEvent) => void
    mouseleave: () => void
    dblclick: (e: MouseEvent) => void
    contextmenu: (e: MouseEvent) => void
  }
}

/**
 * Live2D / Pets 桌宠窗口共享交互壳：
 * - 统一点击穿透去重、左键拖拽（含 unmount 清理）、右键 Hover 菜单、双击切通话、全局 displayWidth 同步。
 */
export function usePetSurfaceShell(options: PetSurfaceShellOptions): PetSurfaceShell {
  const appStore = useAppStore()
  const displayWidthPx = ref(PET_DISPLAY_WIDTH_DEFAULT)

  let dragging = false
  let lastClickThroughIgnore: boolean | null = null
  let activeDragCleanup: (() => void) | null = null

  function setClickThrough(ignore: boolean): void {
    if (lastClickThroughIgnore === ignore)
      return
    lastClickThroughIgnore = ignore
    window.api.setClickThrough(options.surface, ignore)
  }

  async function toggleCall(): Promise<void> {
    if (appStore.isConversationPending)
      return
    try {
      await appStore.toggleAutoConversation()
    }
    catch (error) {
      console.error(`[${options.surface}] 切换通话状态失败`, error)
    }
  }

  function handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0 || !options.isHit(e))
      return

    dragging = true
    setClickThrough(false)
    window.api.hideHover()
    options.onDragStart?.(e)
    window.api.dragStart()

    const handleMouseMoveGlobal = (ev: MouseEvent): void => {
      if (!dragging)
        return
      options.onDragMove?.(ev)
      window.api.dragMove()
    }

    const cleanupDragListeners = (): void => {
      window.removeEventListener('mousemove', handleMouseMoveGlobal)
      window.removeEventListener('mouseup', handleMouseUpGlobal)
      activeDragCleanup = null
    }

    function handleMouseUpGlobal(ev: MouseEvent): void {
      if (!dragging)
        return
      dragging = false
      cleanupDragListeners()
      window.api.dragEnd()
      options.onDragEnd?.(ev)
    }

    activeDragCleanup = cleanupDragListeners
    window.addEventListener('mousemove', handleMouseMoveGlobal)
    window.addEventListener('mouseup', handleMouseUpGlobal)
  }

  function handleMouseEnter(e: MouseEvent): void {
    if (dragging)
      return
    if (options.onHoverEnter) {
      options.onHoverEnter(e)
    }
    else {
      setClickThrough(!options.isHit(e))
    }
  }

  function handleMouseMove(e: MouseEvent): void {
    if (dragging)
      return
    if (options.onHoverMove) {
      options.onHoverMove(e)
    }
    else {
      setClickThrough(!options.isHit(e))
    }
  }

  function handleMouseLeave(): void {
    if (dragging)
      return
    options.onHoverLeave?.()
    setClickThrough(true)
  }

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()

    if (dragging || !options.isHit(e))
      return

    setClickThrough(false)
    window.api.showHoverFor(options.surface, e.screenX, e.screenY)
  }

  function handleDblClick(e: MouseEvent): void {
    if (!options.isHit(e))
      return
    void toggleCall()
  }

  const removeDisplayWidthListener = window.api.petsOnDisplayWidthChanged((width) => {
    const next = clampPetDisplayWidth(width)
    displayWidthPx.value = next
    options.onDisplayWidthChange?.(next)
  })

  async function initDisplayWidth(): Promise<number> {
    let width = PET_DISPLAY_WIDTH_DEFAULT
    try {
      width = clampPetDisplayWidth(await window.api.petsGetDisplayWidth())
    }
    catch {
      width = PET_DISPLAY_WIDTH_DEFAULT
    }
    displayWidthPx.value = width
    return width
  }

  onUnmounted(() => {
    if (dragging) {
      dragging = false
      window.api.dragEnd()
    }
    activeDragCleanup?.()
    removeDisplayWidthListener()
  })

  return {
    displayWidthPx,
    isDragging: () => dragging,
    setClickThrough,
    initDisplayWidth,
    handlers: {
      mousedown: handleMouseDown,
      mouseenter: handleMouseEnter,
      mousemove: handleMouseMove,
      mouseleave: handleMouseLeave,
      dblclick: handleDblClick,
      contextmenu: handleContextMenu,
    },
  }
}
