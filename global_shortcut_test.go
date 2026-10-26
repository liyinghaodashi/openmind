package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"openmind/internal/globalshortcut"
)

type settingsRegistration struct{ active, closed bool }

func (r *settingsRegistration) Activate() { r.active = true }
func (r *settingsRegistration) Close()    { r.closed = true }

func TestGlobalShortcutSettingsLifecycle(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	var registrations []*settingsRegistration
	register := func(globalshortcut.Key) (globalshortcut.Registration, error) {
		r := &settingsRegistration{}
		registrations = append(registrations, r)
		return r, nil
	}
	a.shortcut.Register = register
	settings, _ := a.GetSettings()
	if settings.GlobalWakeShortcut != "" || a.GetGlobalShortcutStatus() != "" || len(registrations) != 0 {
		t.Fatal("defaults must not register a shortcut")
	}
	settings.GlobalWakeShortcut = "Ctrl+Alt+F1"
	if err := a.SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	if len(registrations) != 1 || !registrations[0].active {
		t.Fatal("save must register immediately")
	}
	path := filepath.Join(a.stateDir, "settings.json")
	before, _ := os.ReadFile(path)
	a.shortcut.Register = func(globalshortcut.Key) (globalshortcut.Registration, error) { return nil, errors.New("occupied") }
	settings.GlobalWakeShortcut = "Ctrl+Alt+F2"
	if err := a.SaveSettings(settings); err == nil {
		t.Fatal("occupied shortcut accepted")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) || registrations[0].closed {
		t.Fatal("conflict changed persisted or active shortcut")
	}
	restarted := &App{stateDir: a.stateDir}
	restarted.shortcut.Register = register
	if warning := restarted.GetGlobalShortcutStatus(); warning != "" {
		t.Fatal(warning)
	}
	if len(registrations) != 2 || !registrations[1].active {
		t.Fatal("restart did not restore shortcut")
	}
	got, _ := restarted.GetSettings()
	if got.GlobalWakeShortcut != "Ctrl+Alt+F1" {
		t.Fatalf("saved shortcut: %s", got.GlobalWakeShortcut)
	}
	got.GlobalWakeShortcut = ""
	if err := restarted.SaveSettings(got); err != nil || !registrations[1].closed {
		t.Fatal("clear did not release shortcut")
	}
	got, _ = restarted.GetSettings()
	if got.GlobalWakeShortcut != "" {
		t.Fatal("clear did not persist")
	}
}

func TestStartupShortcutConflictDoesNotDisableOtherSettings(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	settings, _ := a.GetSettings()
	settings.GlobalWakeShortcut = "Ctrl+F1"
	if err := a.writeSettings(settings); err != nil {
		t.Fatal(err)
	}
	a.shortcut.Register = func(globalshortcut.Key) (globalshortcut.Registration, error) { return nil, errors.New("occupied") }
	if a.GetGlobalShortcutStatus() == "" {
		t.Fatal("startup failure must be visible")
	}
	settings.MindNodeMaxWidth = 500
	if err := a.SaveSettings(settings); err != nil {
		t.Fatal("shortcut conflict blocked unrelated settings:", err)
	}
	if a.GetGlobalShortcutStatus() == "" {
		t.Fatal("unrelated save hid startup failure")
	}
	settings.GlobalWakeShortcut = ""
	if err := a.SaveSettings(settings); err != nil || a.GetGlobalShortcutStatus() != "" {
		t.Fatal("clearing failed shortcut must clear warning")
	}
}
