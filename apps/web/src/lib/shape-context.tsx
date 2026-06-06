"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type ShapeVariant = "pill" | "rounded";

interface ShapeClasses {
  item: string;
  bg: string;
  focusRing: string;
  mergedBg: string;
  container: string;
  button: string;
  input: string;
  // Numeric counterparts of `bg` / `mergedBg`, in px. Needed where individual
  // corners are animated (e.g. the selected-background merge/split animation),
  // which requires per-corner numeric border-radii rather than a class.
  bgRadius: number;
  mergedRadius: number;
}

const shapeMap: Record<ShapeVariant, ShapeClasses> = {
  pill: {
    item: "rounded-[20px]",
    bg: "rounded-[20px]",
    // +2px over `item` because the focus ring sits 2px outside the element
    // (top/left -2, width/height +4); this keeps the corners concentric so a
    // pill element gets a pill ring (matches the rounded-mode 8px→10px bump).
    focusRing: "rounded-[22px]",
    mergedBg: "rounded-2xl",
    container: "rounded-3xl",
    button: "rounded-[20px]",
    input: "rounded-[20px]",
    bgRadius: 20,
    mergedRadius: 16,
  },
  rounded: {
    item: "rounded-lg",
    bg: "rounded-lg",
    focusRing: "rounded-[10px]",
    mergedBg: "rounded-lg",
    container: "rounded-xl",
    button: "rounded-lg",
    input: "rounded-lg",
    bgRadius: 8,
    mergedRadius: 8,
  },
};

interface ShapeContextValue {
  shape: ShapeVariant;
  setShape: (shape: ShapeVariant) => void;
  classes: ShapeClasses;
}

const ShapeContext = createContext<ShapeContextValue | null>(null);

function useShape(): ShapeClasses {
  const ctx = useContext(ShapeContext);
  if (!ctx) return shapeMap.pill;
  return ctx.classes;
}

function useShapeContext() {
  const ctx = useContext(ShapeContext);
  if (!ctx) throw new Error("useShapeContext must be used within a ShapeProvider");
  return ctx;
}

function transitionShape(callback: () => void) {
  const root = document.documentElement;
  root.classList.add("transitioning");
  void root.offsetHeight;
  callback();
  setTimeout(() => root.classList.remove("transitioning"), 200);
}

function ShapeProvider({
  children,
  defaultShape = "pill",
}: {
  children: ReactNode;
  defaultShape?: ShapeVariant;
}) {
  const [shape, setShapeState] = useState<ShapeVariant>(defaultShape);

  const setShape = useCallback((next: ShapeVariant) => {
    transitionShape(() => setShapeState(next));
  }, []);

  return (
    <ShapeContext.Provider value={{ shape, setShape, classes: shapeMap[shape] }}>
      {children}
    </ShapeContext.Provider>
  );
}

export { ShapeProvider, useShape, useShapeContext, shapeMap };
export type { ShapeVariant, ShapeClasses };
