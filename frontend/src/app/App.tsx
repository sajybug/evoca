import { useEffect, useState } from "react";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { useOverlayStore } from "../stores/overlayStore";
import { evoca } from "../services/evoca";
import { Overlay } from "../components/overlay/Overlay";
import { Settings } from "../components/settings/Settings";
import type { Configuration } from "../types/domain";

export default function App() {
  const [configurations, setConfigurations] = useState<Configuration[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const open = useOverlayStore((s) => s.open);

  useEffect(() => {
    evoca.getConfigurations().then(setConfigurations).catch(console.error);

    const cancel = EventsOn("evoca:overlay", () => {
      setShowSettings(false);
      open();
    });

    return () => cancel();
  }, [open]);

  return (
    <div className="app-root">
      {showSettings ? (
        <Settings
          configurations={configurations}
          onChange={setConfigurations}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <Overlay
          configurations={configurations}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}
    </div>
  );
}
