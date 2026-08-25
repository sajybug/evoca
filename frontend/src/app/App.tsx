import { useEffect, useState } from "react";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { useOverlayStore } from "../stores/overlayStore";
import { evoca } from "../services/evoca";
import { Overlay } from "../components/overlay/Overlay";
import { Settings } from "../components/settings/Settings";
import { HistoryPanel } from "../components/history/HistoryPanel";
import type { Configuration, Provider } from "../types/domain";

export default function App() {
  const [configurations, setConfigurations] = useState<Configuration[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const open = useOverlayStore((s) => s.open);

  useEffect(() => {
    evoca.getConfigurations().then(setConfigurations).catch(console.error);
    evoca.getProviders().then(setProviders).catch(console.error);

    const cancel = EventsOn("evoca:overlay", () => {
      setShowSettings(false);
      setShowHistory(false);
      open();
    });

    return () => cancel();
  }, [open]);

  return (
    <div className="app-root">
      {showHistory ? (
        <HistoryPanel configurations={configurations} onClose={() => setShowHistory(false)} />
      ) : showSettings ? (
        <Settings
          configurations={configurations}
          onChange={setConfigurations}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <Overlay
          configurations={configurations}
          onOpenSettings={() => setShowSettings(true)}
          onOpenHistory={() => setShowHistory(true)}
          providers={providers}
        />
      )}
    </div>
  );
}
