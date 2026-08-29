package main

import "github.com/sajybug/evoca/internal/app"

// App is the stable Wails binding facade. The implementation lives in
// internal/app so the frontend binding namespace stays independent from the
// internal package layout.
type App struct {
	*app.App
}

func NewApp() *App {
	return &App{App: app.NewApp()}
}
