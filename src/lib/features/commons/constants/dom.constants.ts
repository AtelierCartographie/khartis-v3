/**
 * DOM-related constants
 *
 * Keyboard keys and event types used throughout the application.
 * Centralizes all DOM event handling constants to avoid scattered string literals.
 */

export const KEY = {
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  SPACE: ' ',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
  PLUS: '+',
  MINUS: '-',
  EQUALS: '=',
  ZERO: '0',
  A: 'a',
  C: 'c',
  V: 'v',
  X: 'x',
  Z: 'z',
  Y: 'y'
} as const;

export const EVENT = {
  CLICK: 'click',
  DBLCLICK: 'dblclick',
  MOUSEDOWN: 'mousedown',
  MOUSEUP: 'mouseup',
  MOUSEMOVE: 'mousemove',
  MOUSEENTER: 'mouseenter',
  MOUSELEAVE: 'mouseleave',
  POINTERDOWN: 'pointerdown',
  POINTERUP: 'pointerup',
  POINTERMOVE: 'pointermove',
  POINTERENTER: 'pointerenter',
  POINTERLEAVE: 'pointerleave',
  TOUCHSTART: 'touchstart',
  TOUCHEND: 'touchend',
  TOUCHMOVE: 'touchmove',
  KEYDOWN: 'keydown',
  KEYUP: 'keyup',
  KEYPRESS: 'keypress',
  FOCUS: 'focus',
  BLUR: 'blur',
  FOCUSIN: 'focusin',
  FOCUSOUT: 'focusout',
  CHANGE: 'change',
  INPUT: 'input',
  SUBMIT: 'submit',
  SCROLL: 'scroll',
  WHEEL: 'wheel',
  RESIZE: 'resize',
  LOAD: 'load',
  ERROR: 'error',
  BEFOREUNLOAD: 'beforeunload',
  DRAGSTART: 'dragstart',
  DRAGEND: 'dragend',
  DRAGOVER: 'dragover',
  DROP: 'drop',
  CONTEXTMENU: 'contextmenu',
  TRANSITIONEND: 'transitionend'
} as const;

export const CUSTOM_EVENT = {
  OUTSIDE_CLICK: 'outsideclick',
  RESET: 'reset',
  APPLY: 'apply',
  CANCEL: 'cancel'
} as const;
