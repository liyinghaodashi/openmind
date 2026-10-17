package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/index.html all:frontend/src all:frontend/styles
var assets embed.FS

func main() {
	app, err := NewApp()
	if err != nil {
		log.Fatal(err)
	}
	frontend, err := fs.Sub(assets, "frontend")
	if err != nil {
		log.Fatal(err)
	}
	appMenu := menu.NewMenuFromItems(menu.AppMenu())
	appMenu.AddSubmenu("文件").AddText("关闭窗口", keys.CmdOrCtrl("w"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "window:closing")
	})
	appMenu.Append(menu.EditMenu())
	appMenu.Append(menu.WindowMenu())

	err = wails.Run(&options.App{
		Menu:  appMenu,
		Title: "OpenMind", Width: 1440, Height: 900, MinWidth: 980, MinHeight: 640,
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 255},
		AssetServer:      &assetserver.Options{Assets: frontend, Handler: app.documentAssetHandler()},
		OnStartup:        app.startup, OnDomReady: app.domReady, OnShutdown: app.shutdown, OnBeforeClose: app.beforeClose,
		Bind:               []interface{}{app},
		SingleInstanceLock: &options.SingleInstanceLock{UniqueId: "openmind-local-mvp-01"},
		Mac:                &mac.Options{OnFileOpen: app.onFileOpen, TitleBar: &mac.TitleBar{TitlebarAppearsTransparent: true, HideTitle: true, FullSizeContent: false}, About: &mac.AboutInfo{Title: "OpenMind", Message: "v0.1.0 · Markdown 是你的思维原稿"}},
	})
	if err != nil {
		log.Fatal(err)
	}
}
