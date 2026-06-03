import { useCallback, useEffect, useState } from "react";

export function useResizablePanel(initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback(() => setDragging(true), []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = window.innerWidth - e.clientX;
      setWidth(Math.min(max, Math.max(min, next)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, min, max]);

  return { width, onMouseDown, dragging };
}
