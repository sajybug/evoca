package main

import (
	_ "embed"

	"github.com/getlantern/systray"
)

//go:embed assets/evoca.ico
var trayIcon []byte

func (a *App) startTray() {
	go systray.Run(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("eVoca")
		systray.SetTooltip("eVoca")

		show := systray.AddMenuItem("Toggle eVoca", "Show or hide eVoca overlay")
		systray.AddSeparator()
		quit := systray.AddMenuItem("Quit", "Quit eVoca")

		go func() {
			for {
				select {
				case <-show.ClickedCh:
					a.ToggleOverlay()
				case <-quit.ClickedCh:
					a.Quit()
					return
				}
			}
		}()
	}, func() {})
}

func (a *App) stopTray() { systray.Quit() }
