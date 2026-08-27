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
	app := NewApp()
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
		OnStartup:                app.startup,
		OnDomReady:               app.domReady,
		OnShutdown:               app.shutdown,
		Bind:                     []interface{}{app},
	})
	if err != nil {
		log.Fatal(err)
	}
}
