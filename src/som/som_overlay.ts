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
  const baseSelectors = [
    'a[href]',
    'button',
    'input',
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
    '[contenteditable="true"]',
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

    // Check if an active modal / dialog overlay exists on the page
    const activeModals = Array.from(document.querySelectorAll(
      'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], .modal-backdrop, .modal.show, [aria-modal="true"]'
    )).filter(m => {
      const s = window.getComputedStyle(m);
      return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
    });

    if (activeModals.length > 0) {
      // If an active modal exists and this element is outside it, it is blocked
      const isInsideAnyModal = activeModals.some(m => m.contains(el));
      if (!isInsideAnyModal) {
        return true;
      }
    }

    // Geometric hit-testing via elementFromPoint across 5 sample points
    const points = [
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      { x: rect.left + 3, y: rect.top + 3 },
      { x: rect.right - 3, y: rect.top + 3 },
      { x: rect.left + 3, y: rect.bottom - 3 },
      { x: rect.right - 3, y: rect.bottom - 3 },
    ];

    let hits = 0;
    for (const p of points) {
      const px = Math.max(0, Math.min(window.innerWidth - 1, p.x));
      const py = Math.max(0, Math.min(window.innerHeight - 1, p.y));

      const topEl = document.elementFromPoint(px, py);
      if (!topEl) continue;

      if (topEl === el || el.contains(topEl) || (topEl.contains(el) && !['body', 'html', 'main'].includes(topEl.tagName.toLowerCase()))) {
        hits++;
      }
    }

    return hits === 0;
  }

  // Compute exact visible clipped rectangle intersecting with viewport, ancestor scroll containers, and sticky headers
  function getVisibleClippedRect(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return null;

    // 1. Viewport boundary intersection
    let top = Math.max(0, rect.top);
    let bottom = Math.min(window.innerHeight, rect.bottom);
    let left = Math.max(0, rect.left);
    let right = Math.min(window.innerWidth, rect.right);

    if (bottom <= top || right <= left) {
      return null;
    }

    // 2. Ancestor scroll / overflow container clipping
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const pStyle = window.getComputedStyle(p);
      const oy = pStyle.overflowY;
      const ox = pStyle.overflowX;
      if (['hidden', 'scroll', 'auto', 'clip'].includes(oy) || ['hidden', 'scroll', 'auto', 'clip'].includes(ox)) {
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

    // 3. Fixed / sticky header occlusion clipping from top
    const fixedHeaders = Array.from(document.querySelectorAll(
      'header, nav, [style*="position: fixed"], [style*="position: sticky"], [class*="sticky"], [class*="header"], [class*="navbar"]'
    )).filter(o => {
      if (o === el || o.contains(el) || el.contains(o)) return false;
      const os = window.getComputedStyle(o);
      if (os.display === 'none' || os.visibility === 'hidden' || parseFloat(os.opacity) === 0) return false;
      const pos = os.position;
      return pos === 'fixed' || pos === 'sticky';
    });

    for (const fo of fixedHeaders) {
      const foRect = fo.getBoundingClientRect();
      if (foRect.top <= 5 && foRect.bottom > top && foRect.bottom < bottom && foRect.left < right && foRect.right > left) {
        const midX = Math.max(left + 5, Math.min(right - 5, (left + right) / 2));
        const sampleY = top + 2;
        const topHit = document.elementFromPoint(midX, sampleY);
        if (topHit && (fo === topHit || fo.contains(topHit))) {
          top = Math.max(top, foRect.bottom);
        }
      }
    }

    const width = right - left;
    const height = bottom - top;

    if (width < 6 || height < 6) {
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
  // If an element is a child of an already interactive parent (e.g. text divs inside a clickable card,
  // or spans inside a button) and only has pointer cursor by inheritance, prune the child.
  // Independent interactive controls (like <input>, <select>, <textarea>, <a href>) inside a container remain preserved.
  const prunedElements = visibleCandidates.filter(el => {
    const tag = el.tagName.toLowerCase();
    const isExplicitInteractive = ['input', 'select', 'textarea', 'a', 'button'].includes(tag);

    let parent = el.parentElement;
    while (parent) {
      if (visibleCandidates.includes(parent)) {
        const pTag = parent.tagName.toLowerCase();
        const pStyle = window.getComputedStyle(parent);

        const isParentInteractive = (
          pTag === 'button' ||
          pTag === 'a' ||
          pTag === 'label' ||
          parent.getAttribute('role') === 'button' ||
          parent.getAttribute('role') === 'radio' ||
          parent.getAttribute('role') === 'checkbox' ||
          parent.classList.contains('pointer-card') ||
          parent.classList.contains('icon-btn') ||
          parent.classList.contains('chip') ||
          parent.classList.contains('plan-card') ||
          (pStyle.cursor === 'pointer')
        );

        if (isParentInteractive) {
          // If child is merely text/decorative (div, span, p, heading, text label) inside an interactive parent, prune it
          if (!isExplicitInteractive || (tag === 'label' && pTag === 'label') || (tag === 'span') || (tag === 'div')) {
            return false;
          }
          // If parent is a button or anchor, prune even nested SVGs/spans inside the button
          if (pTag === 'button' || pTag === 'a') {
            return false;
          }
        }
      }
      parent = parent.parentElement;
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

  const marks = [];
  let currentRef = 1;

  // Render naturally clipped bounding boxes and high-contrast red badges
  for (const el of prunedElements) {
    const ref = currentRef++;
    const vRect = el.__som_visible_rect__ || getVisibleClippedRect(el) || el.getBoundingClientRect();
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

    // Numbered Badge (#ref)
    const badge = document.createElement('div');
    badge.className = '__som_badge__';
    badge.textContent = \`\${ref}\`;
    
    // Position badge: prefer top-left above element, or inside top-left if too close to screen/container top
    const badgeTop = (vRect.top >= 18) ? -16 : 0;
    const badgeLeft = 0;

    badge.style.cssText = \`
      position: absolute !important;
      top: \${badgeTop}px !important;
      left: \${badgeLeft}px !important;
      background: #dc2626 !important;
      color: #ffffff !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      padding: 1px 5px !important;
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
        await locator.fill(value || "");
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
