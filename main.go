package main

import (
	"embed"
	"log"

		"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	application := NewApp()
	err := wails.Run(&options.App{
		Title:                    "eVoca",
		Width:                    950,
		Height:                   600,
		MinWidth:                 950,
		MinHeight:                600,
		StartHidden:              true,
		HideWindowOnClose:        true,
		Frameless:                true,
		AlwaysOnTop:              true,
		BackgroundColour:         options.NewRGBA(0, 0, 0, 0),
		EnableDefaultContextMenu: false,
		AssetServer:              &assetserver.Options{Assets: assets},
		OnStartup:                application.Startup,
		OnDomReady:               application.DomReady,
		OnShutdown:               application.Shutdown,
		Bind:                     []interface{}{application},
	})
	if err != nil {
		log.Fatal(err)
	}
}
