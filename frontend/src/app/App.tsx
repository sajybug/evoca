import { useEffect, useState } from "react";
import { EventsEmit, EventsOn } from "../wailsjs/runtime/runtime";
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
    const restored = EventsOn("evoca:data:restored", async () => {
      try {
        const [nextConfigurations, nextProviders] = await Promise.all([evoca.getConfigurations(), evoca.getProviders()]);
        setConfigurations(nextConfigurations);
        setProviders(nextProviders);
      } catch (error) {
        console.error("restored data reload failed", error);
      }
    });

    return () => { cancel(); restored(); };
  }, [open]);

  return (
    <div className="h-full w-full bg-[radial-gradient(circle_at_14%_-5%,rgba(216,184,110,.07),transparent_30%),radial-gradient(circle_at_100%_100%,rgba(96,106,140,.05),transparent_34%),linear-gradient(180deg,#090b0f,#08090c_60%,#07080a)]">
      {showHistory ? (
        <HistoryPanel configurations={configurations} onClose={() => setShowHistory(false)} onRunAgain={(execution) => { setShowHistory(false); window.setTimeout(() => EventsEmit("evoca:run-again", { executionId: execution.id }), 50); }} />
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
