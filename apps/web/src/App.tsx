import { Dashboard } from "./screens/Dashboard.tsx";
import { MiniAppScreen } from "./screens/MiniAppScreen.tsx";
import { Settings } from "./screens/Settings.tsx";
import { useStore } from "./store.tsx";

export function App() {
  const { view } = useStore();

  return (
    <div className="h-full w-full overflow-hidden">
      {view.name === "dashboard" && <Dashboard />}
      {view.name === "settings" && <Settings />}
      {view.name === "miniApp" && <MiniAppScreen appId={view.appId} />}
    </div>
  );
}
