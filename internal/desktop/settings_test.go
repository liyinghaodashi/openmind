package desktop

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSettingsDefaults(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	settings, err := a.GetSettings()
	if err != nil || settings != (AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true}) {
		t.Fatalf("default settings: %+v, %v", settings, err)
	}
	path := filepath.Join(a.stateDir, "settings.json")
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("reading defaults should not create settings: %v", err)
	}
	for _, fixture := range []struct {
		input string
		want  AppSettings
	}{
		{`{"mindZoomControls":false}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: false, MindCopyTree: true}},
		{`{"mindCopyTree":false}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: false}},
		{`{}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true}},
		{`{"sidebarCollapse":false}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: false, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true}},
		{`{"mindOutlineFocus":false}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: false, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true}},
		{`{"mindOutlineCollapse":false}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: false, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true}},
		{`{"mindDoubleClickCreateMain":false}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: false, SourceView: true, MindZoomControls: true, MindCopyTree: true}},
		{`{"sourceView":false}`, AppSettings{MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindNodeMaxWidth: 340, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: false, MindZoomControls: true, MindCopyTree: true}},
	} {
		if err := os.WriteFile(path, []byte(fixture.input), 0600); err != nil {
			t.Fatal(err)
		}
		settings, err = a.GetSettings()
		if err != nil || settings != fixture.want {
			t.Fatalf("missing options should use defaults for %s: %+v, %v", fixture.input, settings, err)
		}
	}
}

func TestSettingsPersistAcrossRestart(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	workspacePath := filepath.Join(a.stateDir, "workspace.json")
	workspace := `{"root":"/existing","name":"existing","recent":[]}`
	if err := os.WriteFile(workspacePath, []byte(workspace), 0600); err != nil {
		t.Fatal(err)
	}
	for _, want := range []AppSettings{
		{MindNodeMaxWidth: 280, MindMainNodeMark: true},
		{MindNodeMaxWidth: 280, MindSecondNodeMark: true},
		{MindNodeMaxWidth: 280, MindMainNodeMark: true, MindSecondNodeMark: true},
		{MDCompactWindow: true, MindNodeMaxWidth: 280},
		{MDCompactWindow: false, MindNodeMaxWidth: 280},
		{MindNodeMaxWidth: 280, ExpandFileNameOnHover: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: false},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: false, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: false, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: false, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: false, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: false, MindOutlineCollapse: false, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: false, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: false, MindZoomControls: true, MindCopyTree: true},
		{MindNodeMaxWidth: 280, SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true},
	} {
		if err := a.SaveSettings(want); err != nil {
			t.Fatal(err)
		}
		restarted := &App{stateDir: a.stateDir}
		settings, err := restarted.GetSettings()
		if err != nil || settings != want {
			t.Fatalf("restart should retain %+v: %+v, %v", want, settings, err)
		}
		a = restarted
	}
	data, err := os.ReadFile(workspacePath)
	if err != nil || string(data) != workspace {
		t.Fatalf("settings changed workspace history: %s, %v", data, err)
	}
	files, err := filepath.Glob(filepath.Join(a.stateDir, "settings-*.tmp"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary files remain: %v, %v", files, err)
	}
}

func TestInvalidSettingsAreNotOverwrittenOnRead(t *testing.T) {
	for _, input := range []string{`{"mdCompactWindow":"false"}`, `{`, `null`, `[]`, `{"sidebarCollapse":"false"}`, `{"mindOutlineFocus":"false"}`, `{"mindOutlineCollapse":0}`, `{"mindDoubleClickCreateMain":"false"}`, `{"sourceView":"false"}`, `{"mindZoomControls":"false"}`, `{"mindCopyTree":"false"}`} {
		t.Run(input, func(t *testing.T) {
			a := &App{stateDir: t.TempDir()}
			path := filepath.Join(a.stateDir, "settings.json")
			if err := os.WriteFile(path, []byte(input), 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := a.GetSettings(); err == nil {
				t.Fatal("invalid settings accepted")
			}
			data, err := os.ReadFile(path)
			if err != nil || string(data) != input {
				t.Fatalf("invalid settings were overwritten: %s, %v", data, err)
			}
		})
	}
}

func TestSettingsSaveFailure(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	path := filepath.Join(a.stateDir, "settings.json")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(path, "existing")
	if err := os.WriteFile(sentinel, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveSettings(AppSettings{MindNodeMaxWidth: 280, SidebarCollapse: false}); err == nil {
		t.Fatal("failed replacement was reported as saved")
	}
	data, err := os.ReadFile(sentinel)
	if err != nil || string(data) != "keep" {
		t.Fatalf("failed replacement changed existing data: %s, %v", data, err)
	}
	files, err := filepath.Glob(filepath.Join(a.stateDir, "settings-*.tmp"))
	if err != nil || len(files) != 0 {
		t.Fatalf("failed save left temporary files: %v, %v", files, err)
	}
}

func TestMindNodeMaxWidthPersistenceAndValidation(t *testing.T) {
	a := &App{stateDir: t.TempDir()}
	settings, err := a.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	for _, width := range []int{160, 600, 1600} {
		settings.MindNodeMaxWidth = width
		if err := a.SaveSettings(settings); err != nil {
			t.Fatal(err)
		}
		restarted := &App{stateDir: a.stateDir}
		got, err := restarted.GetSettings()
		if err != nil || got != settings {
			t.Fatalf("width did not persist: %+v, %v", got, err)
		}
	}
	for _, width := range []int{0, -1, 159, 1601} {
		invalid := settings
		invalid.MindNodeMaxWidth = width
		if err := a.SaveSettings(invalid); err == nil {
			t.Fatalf("accepted invalid width %d", width)
		}
		got, err := a.GetSettings()
		if err != nil || got != settings {
			t.Fatalf("invalid save changed settings: %+v, %v", got, err)
		}
	}
	for _, input := range []string{`{"mindNodeMaxWidth":0}`, `{"mindNodeMaxWidth":1601}`, `{"mindNodeMaxWidth":280.5}`, `{"mindNodeMaxWidth":"600"}`} {
		path := filepath.Join(a.stateDir, "settings.json")
		if err := os.WriteFile(path, []byte(input), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := a.GetSettings(); err == nil {
			t.Fatalf("accepted %s", input)
		}
	}
}

func TestSettingsUpgradeDropsRetiredWakeShortcut(t *testing.T) {
	app := &App{stateDir: t.TempDir()}
	path := filepath.Join(app.stateDir, "settings.json")
	if err := os.WriteFile(path, []byte(`{"globalWakeShortcut":"Ctrl+F1","mindStyle":"mindnode"}`), 0600); err != nil {
		t.Fatal(err)
	}
	settings, err := app.GetSettings()
	if err != nil || settings.MindNodeMaxWidth != 340 {
		t.Fatalf("load previous settings: %+v, %v", settings, err)
	}
	if err := app.SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		t.Fatal(err)
	}
	_, wakePresent := fields["globalWakeShortcut"]
	_, stylePresent := fields["mindStyle"]
	if wakePresent || stylePresent {
		t.Fatalf("unexpected retired settings after upgrade: %s", data)
	}
}
