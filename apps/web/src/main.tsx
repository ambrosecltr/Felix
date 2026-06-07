import { StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { IconProvider } from "./lib/icon-context.tsx";
import { ShapeProvider } from "./lib/shape-context.tsx";
import { SurfaceProvider } from "./lib/surface-context.tsx";
import { StoreProvider } from "./store.tsx";
import { UpdateProvider } from "./components/UpdateProvider.tsx";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <SystemTheme>
      <ShapeProvider defaultShape="pill">
        <IconProvider defaultLibrary="hugeicons">
          <SurfaceProvider value={1}>
            <UpdateProvider>
              <StoreProvider>
                <App />
              </StoreProvider>
            </UpdateProvider>
          </SurfaceProvider>
        </IconProvider>
      </ShapeProvider>
    </SystemTheme>
  </StrictMode>,
);

function SystemTheme({ children }: { children: ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.classList.toggle("dark", media.matches);
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, []);

  return children;
}
