import { Page } from "playwright";

export interface SomElementMark {
  ref: number;
  tagName: string;
  id?: string;
  className?: string;
  type?: string;
  role?: string;
  ariaLabel?: string;
  title?: string;
  text?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    bottom: number;
    right: number;
  };
  isSvg: boolean;
  isImg: boolean;
  hasPointerCursor: boolean;
}

export interface SomInjectionResult {
  totalMarks: number;
  marks: SomElementMark[];
}

/**
 * JavaScript snippet to be injected into the browser page.
 * Detects all interactive elements (<svg>, <img>, cursor:pointer, buttons, inputs, links, etc.)
 * Intelligently deduplicates child nodes (paths inside SVGs, text spans inside buttons/pointer cards)
 * Draws numbered bounding boxes with high-contrast red badges, and stores mapping on window.__som_marks__.
 */
export const SOM_INJECTION_SCRIPT = `
(() => {
  // Clean up any existing overlay
  if (window.__som_cleanup__) {
    window.__som_cleanup__();
  }

  // Map to store reference ID -> DOM Element
  window.__som_marks__ = new Map();
  
  const OVERLAY_CONTAINER_ID = '__som_overlay_container__';
  const overlayContainer = document.createElement('div');
  overlayContainer.id = OVERLAY_CONTAINER_ID;
  overlayContainer.style.cssText = \`
    position: fixed !important;
    top: 0px !important;
    left: 0px !important;
    width: 100vw !important;
    height: 100vh !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    filter: none !important;
    backdrop-filter: none !important;
    isolation: isolate !important;
    overflow: hidden !important;
  \`;

  // Candidate interactive elements
  // Candidate interactive elements
  const baseSelectors = [
    'a',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="radio"]',
    '[role="option"]',
    '[contenteditable="true"]',
    '.MuiButtonBase-root',
    '.MuiListItemButton-root',
    '.MuiTab-root',
    '.btn',
    '.button',
    'svg',
    'img'
  ].join(',');

  const allElements = Array.from(document.querySelectorAll('*'));
  const candidateSet = new Set();

  // Add standard selector matches
  document.querySelectorAll(baseSelectors).forEach(el => candidateSet.add(el));

  // Add elements with cursor: pointer or onclick handlers
  for (const el of allElements) {
    if (el === overlayContainer || overlayContainer.contains(el)) continue;
    
    // Ignore internal SVG sub-tags like path, circle, rect, polygon, g, line, defs
    const tag = el.tagName.toLowerCase();
    if (['path', 'circle', 'rect', 'polygon', 'g', 'line', 'defs', 'clippath', 'use', 'polyline'].includes(tag)) {
      continue;
    }

    const style = window.getComputedStyle(el);
    if (style.cursor === 'pointer') {
      candidateSet.add(el);
    } else if (el.hasAttribute('onclick') || el.onclick) {
      candidateSet.add(el);
    }
  }

  // Helper to check if an element is occluded / covered by another element (e.g. modal backdrop, dialog, popup overlay)
  function isElementOccluded(el, rect) {
    if (el.closest('[inert]') || el.closest('[aria-hidden="true"]')) {
      return true;
    }

    // Check if an active, genuinely visible modal / dialog overlay exists on the page
    const activeModals = Array.from(document.querySelectorAll(
      'dialog[open], [role="dialog"]:not([aria-hidden="true"]), [role="alertdialog"]:not([aria-hidden="true"]), .modal.show'
    )).filter(m => {
      const s = window.getComputedStyle(m);
      const mRect = m.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.5 && mRect.width > 150 && mRect.height > 150;
    });

    if (activeModals.length > 0) {
      // If an active modal genuinely exists and is visible on screen, prioritize elements inside the modal
      const isInsideAnyModal = activeModals.some(m => m.contains(el));
      if (!isInsideAnyModal) {
        return true;
      }
    }

    return false;
  }

  // Compute exact visible clipped rectangle intersecting with viewport and ancestor scroll containers
  function getVisibleClippedRect(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return null;

    // 1. Viewport boundary intersection
    let top = Math.max(0, rect.top);
    let bottom = Math.min(window.innerHeight, rect.bottom);
    let left = Math.max(0, rect.left);
    let right = Math.min(window.innerWidth, rect.right);

    if (bottom <= top || right <= left) {
      return null;
    }

    // 2. Ancestor scroll container clipping (ONLY for non-fixed elements inside actual scrolling ancestors)
    const elStyle = window.getComputedStyle(el);
    if (elStyle.position !== 'fixed') {
      let p = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        const pStyle = window.getComputedStyle(p);
        if (pStyle.position === 'fixed') {
          // Inside a fixed container (like MuiDrawer-paper or sticky sidebar) - clip to this fixed container
          const pRect = p.getBoundingClientRect();
          top = Math.max(top, pRect.top);
          bottom = Math.min(bottom, pRect.bottom);
          left = Math.max(left, pRect.left);
          right = Math.min(right, pRect.right);
          break;
        }

        const oy = pStyle.overflowY;
        const ox = pStyle.overflowX;
        const isScroll = ['hidden', 'scroll', 'auto', 'clip'].includes(oy) || ['hidden', 'scroll', 'auto', 'clip'].includes(ox);
        if (isScroll && (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)) {
          const pRect = p.getBoundingClientRect();
          top = Math.max(top, pRect.top);
          bottom = Math.min(bottom, pRect.bottom);
          left = Math.max(left, pRect.left);
          right = Math.min(right, pRect.right);

          if (bottom <= top || right <= left) {
            return null;
          }
        }
        p = p.parentElement;
      }
    }

    const width = right - left;
    const height = bottom - top;

    if (width < 4 || height < 4) {
      return null;
    }

    return {
      top,
      bottom,
      left,
      right,
      width,
      height,
      originalRect: rect,
    };
  }

  // Helper to check if an element is an atomic interactive unit
  function isAtomicInteractive(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName.toLowerCase();
    if (['button', 'select', 'textarea', 'summary'].includes(tag)) return true;
    if (tag === 'input' && el.type !== 'hidden') return true;
    if (tag === 'a' && (el.hasAttribute('href') || el.hasAttribute('onclick') || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link')) return true;

    const role = el.getAttribute('role');
    if (role && ['button', 'link', 'tab', 'menuitem', 'checkbox', 'switch', 'radio', 'option'].includes(role)) {
      return true;
    }

    if (el.hasAttribute('onclick') || el.onclick) {
      return true;
    }

    if (el.classList.contains('MuiButtonBase-root') || el.classList.contains('MuiListItemButton-root') || el.classList.contains('btn') || el.classList.contains('button')) {
      return true;
    }

    if (el.getAttribute('tabindex') === '0' && !['body', 'html', 'main'].includes(tag)) {
      return true;
    }

    return false;
  }

  // Filter visible elements in viewport that are not occluded
  const visibleCandidates = Array.from(candidateSet).filter(el => {
    if (!el || !(el instanceof Element)) return false;
    if (el.closest('#' + OVERLAY_CONTAINER_ID)) return false;

    // Ignore SVG sub-elements
    const tag = el.tagName.toLowerCase();
    if (['path', 'circle', 'rect', 'polygon', 'g', 'line', 'defs', 'clippath', 'use', 'polyline'].includes(tag)) {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      return false;
    }

    const visibleRect = getVisibleClippedRect(el);
    if (!visibleRect) {
      return false;
    }

    // Occlusion & Dialog check
    if (isElementOccluded(el, visibleRect)) {
      return false;
    }

    el.__som_visible_rect__ = visibleRect;
    return true;
  });

  // Hierarchy pruning:
  // 1. If el is an atomic interactive unit (button, link, sidebar item, etc.), preserve it.
  // 2. If el is an inner sub-node (span, svg, text div) inside an atomic interactive parent, prune el so the badge is placed on the parent button.
  // 3. If el is a large container (nav, ul, sidebar, card group) with >=2 interactive children, prune the container.
  const prunedElements = visibleCandidates.filter(el => {
    const isElAtomic = isAtomicInteractive(el);

    let parent = el.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      if (visibleCandidates.includes(parent)) {
        if (isAtomicInteractive(parent)) {
          // Parent is already an atomic interactive element (e.g. <div role="button">, <a>, <button>)
          if (!isElAtomic) {
            return false;
          }
          if (['a', 'button'].includes(parent.tagName.toLowerCase()) || parent.getAttribute('role') === 'button') {
            return false;
          }
        }
      }
      parent = parent.parentElement;
    }

    // If el is a container with multiple interactive children, prune the container
    const childInteractiveCount = el.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], .MuiButtonBase-root, .MuiListItemButton-root').length;
    if (childInteractiveCount >= 2 && !['button', 'a'].includes(el.tagName.toLowerCase())) {
      return false;
    }

    return true;
  });

  // Sort elements top-to-bottom, left-to-right for intuitive visual order
  prunedElements.sort((a, b) => {
    const ra = a.__som_visible_rect__ || a.getBoundingClientRect();
    const rb = b.__som_visible_rect__ || b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 12) {
      return ra.top - rb.top;
    }
    return ra.left - rb.left;
  });

  // Dynamic collision-free badge positioning algorithm
  const placedBadges = [];

  function hasBadgeCollision(cand, placed) {
    const margin = 1;
    return placed.some(p => !(
      (cand.x + cand.width + margin) <= p.left ||
      (cand.x - margin) >= p.right ||
      (cand.y + cand.height + margin) <= p.top ||
      (cand.y - margin) >= p.bottom
    ));
  }

  function findBestBadgePosition(vRect, ref) {
    const badgeWidth = String(ref).length * 7 + 10;
    const badgeHeight = 16;
    const isEven = ref % 2 === 0;

    const rawCandidates = [];

    // Small elements (carousel dots, icon buttons, arrows <= 36px)
    if (vRect.width <= 36 && vRect.height <= 36) {
      if (isEven) {
        rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.bottom + 2 });
        rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.top - badgeHeight - 2 });
      } else {
        rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.top - badgeHeight - 2 });
        rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.bottom + 2 });
      }
      rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.top + (vRect.height - badgeHeight) / 2 });
      rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.top - badgeHeight * 2 - 3 });
      rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.bottom + badgeHeight + 3 });
    } else {
      // Normal / larger elements
      rawCandidates.push({ x: vRect.left, y: vRect.top - badgeHeight });
      rawCandidates.push({ x: vRect.right - badgeWidth, y: vRect.top - badgeHeight });
      rawCandidates.push({ x: vRect.left + 2, y: vRect.top + 2 });
      rawCandidates.push({ x: vRect.right - badgeWidth - 2, y: vRect.top + 2 });
      rawCandidates.push({ x: vRect.left, y: vRect.bottom + 1 });
      rawCandidates.push({ x: vRect.right - badgeWidth, y: vRect.bottom + 1 });
      rawCandidates.push({ x: vRect.left + (vRect.width - badgeWidth) / 2, y: vRect.top + (vRect.height - badgeHeight) / 2 });
      rawCandidates.push({ x: vRect.left, y: vRect.bottom - badgeHeight - 2 });
    }

    // Secondary lateral offsets
    rawCandidates.push({ x: vRect.left - badgeWidth - 2, y: vRect.top });
    rawCandidates.push({ x: vRect.right + 2, y: vRect.top });

    // Find first collision-free candidate within viewport bounds
    for (const cand of rawCandidates) {
      const cx = Math.max(2, Math.min(window.innerWidth - badgeWidth - 2, cand.x));
      const cy = Math.max(2, Math.min(window.innerHeight - badgeHeight - 2, cand.y));

      const candRect = {
        x: cx,
        y: cy,
        width: badgeWidth,
        height: badgeHeight,
        left: cx,
        top: cy,
        right: cx + badgeWidth,
        bottom: cy + badgeHeight
      };

      if (!hasBadgeCollision(candRect, placedBadges)) {
        placedBadges.push(candRect);
        return candRect;
      }
    }

    // Fallback if heavily congested
    const defaultX = Math.max(2, Math.min(window.innerWidth - badgeWidth - 2, vRect.left));
    const defaultY = Math.max(2, Math.min(window.innerHeight - badgeHeight - 2, vRect.top >= 18 ? vRect.top - badgeHeight : vRect.top));
    const fallback = {
      x: defaultX,
      y: defaultY,
      width: badgeWidth,
      height: badgeHeight,
      left: defaultX,
      top: defaultY,
      right: defaultX + badgeWidth,
      bottom: defaultY + badgeHeight
    };
    placedBadges.push(fallback);
    return fallback;
  }

  const marks = [];
  let currentRef = 1;

  // Render naturally clipped bounding boxes and high-contrast red badges
  for (const el of prunedElements) {
    const vRect = el.__som_visible_rect__ || getVisibleClippedRect(el);
    if (!vRect || !vRect.width || !vRect.height || vRect.width < 4 || vRect.height < 4) {
      continue;
    }
    const ref = currentRef++;
    const style = window.getComputedStyle(el);

    // Save mapping to window object and stamp data attribute
    window.__som_marks__.set(ref, el);
    el.setAttribute('data-som-ref', String(ref));

    const isSvg = el.tagName.toLowerCase() === 'svg' || el.querySelector('svg') !== null;
    const isImg = el.tagName.toLowerCase() === 'img';
    const hasPointerCursor = style.cursor === 'pointer';

    // Bounding Box (position: fixed relative to viewport, naturally clipped to visible area)
    const box = document.createElement('div');
    box.className = '__som_box__';
    box.style.cssText = \`
      position: fixed !important;
      top: \${vRect.top}px !important;
      left: \${vRect.left}px !important;
      width: \${vRect.width}px !important;
      height: \${vRect.height}px !important;
      border: 2px solid #ef4444 !important;
      background: rgba(239, 68, 68, 0.08) !important;
      border-radius: 4px !important;
      box-sizing: border-box !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    \`;

    // Dynamic collision-free badge placement
    const badgePos = findBestBadgePosition(vRect, ref);
    const relBadgeTop = Math.round(badgePos.y - vRect.top);
    const relBadgeLeft = Math.round(badgePos.x - vRect.left);

    // Numbered Badge (#ref)
    const badge = document.createElement('div');
    badge.className = '__som_badge__';
    badge.textContent = \`\${ref}\`;
    
    badge.style.cssText = \`
      position: absolute !important;
      top: \${relBadgeTop}px !important;
      left: \${relBadgeLeft}px !important;
      background: #dc2626 !important;
      color: #ffffff !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      padding: 1px 4px !important;
      border-radius: 3px !important;
      line-height: 14px !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.6) !important;
      border: 1px solid rgba(255,255,255,0.8) !important;
      z-index: 2147483647 !important;
      white-space: nowrap !important;
      display: inline-block !important;
      visibility: visible !important;
      opacity: 1 !important;
    \`;

    box.appendChild(badge);
    overlayContainer.appendChild(box);

    marks.push({
      ref,
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: el.className ? String(el.className) : undefined,
      type: el.getAttribute('type') || undefined,
      role: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      title: el.getAttribute('title') || undefined,
      text: el.textContent ? el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) : undefined,
      rect: {
        x: Math.round(vRect.left),
        y: Math.round(vRect.top),
        width: Math.round(vRect.width),
        height: Math.round(vRect.height),
        top: Math.round(vRect.top),
        left: Math.round(vRect.left),
        bottom: Math.round(vRect.bottom),
        right: Math.round(vRect.right)
      },
      isSvg,
      isImg,
      hasPointerCursor
    });
  }

  // Attach to document.documentElement (root) to avoid any transform/contain clipping on body
  (document.documentElement || document.body).appendChild(overlayContainer);

  // Global cleanup handler
  window.__som_cleanup__ = () => {
    const existing = document.getElementById(OVERLAY_CONTAINER_ID);
    if (existing) existing.remove();
    document.querySelectorAll('[data-som-ref]').forEach(el => el.removeAttribute('data-som-ref'));
  };

  return {
    totalMarks: marks.length,
    marks
  };
})();
`;

export class SomManager {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Injects the Set-of-Marks overlay into the page.
   * Returns metadata for all detected numbered elements.
   */
  async injectOverlay(): Promise<SomInjectionResult> {
    const result = await this.page.evaluate(SOM_INJECTION_SCRIPT) as SomInjectionResult;
    return result;
  }

  /**
   * Removes visual bounding boxes and badges from DOM.
   */
  async cleanupOverlay(): Promise<void> {
    await this.page.evaluate(() => {
      if ((window as any).__som_cleanup__) {
        (window as any).__som_cleanup__();
      }
    });
  }

  /**
   * Takes an annotated screenshot with SoM overlays rendered.
   */
  async takeAnnotatedScreenshot(outputPath: string): Promise<SomInjectionResult> {
    const result = await this.injectOverlay();
    await this.page.screenshot({ path: outputPath, fullPage: false });
    return result;
  }

  /**
   * Executes an action on an element by its ref ID:
   * Maps ref -> DOM element stored during overlay injection.
   */
  async executeAction(action: {
    action: "click" | "fill" | "hover" | "press" | "select";
    ref: number;
    value?: string;
    key?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { action: act, ref, value, key } = action;

    const locator = this.page.locator(`[data-som-ref="${ref}"]`);
    const count = await locator.count();

    if (count === 0) {
      // Fallback check in window.__som_marks__
      const foundInMap = await this.page.evaluate((r) => {
        const marks = (window as any).__som_marks__;
        return marks && marks.has(r);
      }, ref);

      if (!foundInMap) {
        throw new Error(`[SoM] Ref #${ref} not found on page. Did the DOM change or is the ref invalid?`);
      }
    }

    switch (act) {
      case "click": {
        await locator.scrollIntoViewIfNeeded();
        await locator.click({ force: true });
        return { success: true, message: `Clicked element #${ref}` };
      }
      case "fill": {
        await locator.scrollIntoViewIfNeeded();
        try {
          await locator.fill(value || "");
        } catch (fillErr: any) {
          // If the marked element is a wrapper (div, label, custom form group), search for inner input
          try {
            const innerInput = locator.locator("input, textarea, [contenteditable='true']").first();
            if ((await innerInput.count()) > 0) {
              await innerInput.scrollIntoViewIfNeeded();
              await innerInput.fill(value || "");
            } else {
              // Fallback: Click to focus and type with keyboard
              await locator.click({ force: true });
              await this.page.keyboard.press("ControlOrMeta+a");
              await this.page.keyboard.press("Backspace");
              await this.page.keyboard.type(value || "", { delay: 20 });
            }
          } catch (innerErr) {
            throw fillErr;
          }
        }
        return { success: true, message: `Filled element #${ref} with "${value}"` };
      }
      case "select": {
        await locator.scrollIntoViewIfNeeded();
        await locator.selectOption(value || "");
        return { success: true, message: `Selected "${value}" on element #${ref}` };
      }
      case "hover": {
        await locator.scrollIntoViewIfNeeded();
        await locator.hover({ force: true });
        return { success: true, message: `Hovered element #${ref}` };
      }
      case "press": {
        await locator.press(key || "Enter");
        return { success: true, message: `Pressed key "${key}" on element #${ref}` };
      }
      default:
        throw new Error(`Unsupported action "${act}"`);
    }
  }
}
