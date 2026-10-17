package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRetiredIconSettingPreservesOtherPreferences(t *testing.T) {
	for _, legacy := range []string{
		`{"sidebarCollapse":false,"animeIcon":true}`,
		`{"sidebarCollapse":false,"animeIcon":false}`,
	} {
		t.Run(legacy, func(t *testing.T) {
			a := &App{stateDir: t.TempDir()}
			path := filepath.Join(a.stateDir, "settings.json")
			if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
				t.Fatal(err)
			}
			settings, err := a.GetSettings()
			if err != nil || settings.SidebarCollapse {
				t.Fatalf("legacy settings must preserve sidebar preference: %+v, %v", settings, err)
			}
			if err := a.SaveSettings(settings); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var saved map[string]any
			if err := json.Unmarshal(data, &saved); err != nil {
				t.Fatal(err)
			}
			if _, exists := saved["animeIcon"]; exists {
				t.Fatal("retired icon option must not be saved")
			}
			if value, exists := saved["sidebarCollapse"]; !exists || value != false {
				t.Fatal("sidebar preference must remain unchanged")
			}
		})
	}
}
