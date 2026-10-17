package main

import "openmind/internal/window"

func (a *App) ToggleWindowMaximise() {
	window.ToggleMaximise()
}

func (a *App) FinishWindowClose() {
	window.Hide()
}

func (a *App) SetCompactWindow(enabled bool) error {
	return window.SetCompact(enabled)
}
