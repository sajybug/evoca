package main

import (
	_ "embed"

	"github.com/secoba/systray"
)

//go:embed assets/evoca.ico
var trayIcon []byte

func (a *App) startTray() {
	go systray.Run(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("eVoca")
		systray.SetTooltip("eVoca")

		show := systray.AddMenuItem("Toggle eVoca", "Show or hide eVoca overlay")

		// Native tray behavior on Windows: left click toggles the main window,
		// while right click explicitly opens the context menu.
		systray.SetOnClick(func(menu systray.IMenu) {
			a.ToggleOverlay()
		})
		systray.SetOnRClick(func(menu systray.IMenu) {
			_ = menu.ShowMenu()
		})

		// Keep the menu item as an explicit action as well. The current systray
		// API uses callbacks on MenuItem instead of ClickedCh channels.
		show.Click(func() {
			a.ToggleOverlay()
		})

		autostart := systray.AddMenuItemCheckbox("Start eVoca with Windows", "Launch eVoca automatically when Windows starts", false)
		if enabled, err := a.IsAutostartEnabled(); err == nil && enabled {
			autostart.Check()
		}
		autostart.Click(func() {
			enabled, err := a.IsAutostartEnabled()
			if err != nil {
				return
			}
			enabled = !enabled
			if err := a.SetAutostart(enabled); err != nil {
				return
			}
			if enabled {
				autostart.Check()
			} else {
				autostart.Uncheck()
			}
		})

		systray.AddSeparator()
		quit := systray.AddMenuItem("Quit", "Quit eVoca")
		quit.Click(func() {
			a.Quit()
		})
	}, func() {})
}

func (a *App) stopTray() { systray.Quit() }
