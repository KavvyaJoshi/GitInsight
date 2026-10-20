import { useEffect, useState } from 'react';

type Fade = 'none' | 'left' | 'right' | 'both';

/**
 * For a horizontally scrollable strip: reports which edges hide more content (for a fade mask)
 * and keeps the element matching `activeSelector` scrolled into view. Pass `ref` as the strip's ref;
 * it re-attaches whenever the strip mounts again (e.g. after an error screen).
 */
export function useScrollFade<T extends HTMLElement>(activeSelector: string, activeKey: string) {
  const [el, setEl] = useState<T | null>(null);
  const [fade, setFade] = useState<Fade>('none');

  useEffect(() => {
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setFade(left && right ? 'both' : left ? 'left' : right ? 'right' : 'none');
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [el]);

  useEffect(() => {
    el?.querySelector(activeSelector)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [el, activeSelector, activeKey]);

  return { ref: setEl, fade };
}
