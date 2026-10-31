package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type AppSettings struct {
	MindNodeMaxWidth          int    `json:"mindNodeMaxWidth"`
	MindMainNodeMark          bool   `json:"mindMainNodeMark"`
	MindSecondNodeMark        bool   `json:"mindSecondNodeMark"`
	MDCompactWindow           bool   `json:"mdCompactWindow"`
	ExpandFileNameOnHover     bool   `json:"expandFileNameOnHover"`
	HideFileExtensions        bool   `json:"hideFileExtensions"`
	MindStyle                 string `json:"mindStyle"`
	MindZoomControls          bool   `json:"mindZoomControls"`
	MindCopyTree              bool   `json:"mindCopyTree"`
	SidebarCollapse           bool   `json:"sidebarCollapse"`
	MindOutlineFocus          bool   `json:"mindOutlineFocus"`
	MindOutlineCollapse       bool   `json:"mindOutlineCollapse"`
	MindDoubleClickCreateMain bool   `json:"mindDoubleClickCreateMain"`
	SourceView                bool   `json:"sourceView"`
}

func (a *App) GetSettings() (AppSettings, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.readSettings()
}

func (a *App) readSettings() (AppSettings, error) {
	settings := &AppSettings{MindNodeMaxWidth: 340, MindMainNodeMark: true, MindSecondNodeMark: true, MDCompactWindow: true, MindStyle: "processon", SidebarCollapse: true, MindOutlineFocus: true, MindOutlineCollapse: true, MindDoubleClickCreateMain: true, SourceView: true, MindZoomControls: true, MindCopyTree: true}
	data, err := os.ReadFile(filepath.Join(a.stateDir, "settings.json"))
	if os.IsNotExist(err) {
		return *settings, nil
	}
	if err != nil {
		return AppSettings{}, err
	}
	if err := json.Unmarshal(data, &settings); err != nil {
		return AppSettings{}, fmt.Errorf("读取设置失败：%w", err)
	}
	if settings == nil {
		return AppSettings{}, fmt.Errorf("设置文件必须是 JSON 对象")
	}
	if err := settings.validate(); err != nil {
		return AppSettings{}, err
	}
	return *settings, nil
}

func (settings AppSettings) validate() error {
	if settings.MindNodeMaxWidth < 160 || settings.MindNodeMaxWidth > 1600 {
		return fmt.Errorf("节点最大宽度必须是 160–1600 之间的整数")
	}
	if settings.MindStyle != "processon" && settings.MindStyle != "mindnode" {
		return fmt.Errorf("无效的 mind 渲染风格：%q", settings.MindStyle)
	}
	return nil
}

func (a *App) SaveSettings(settings AppSettings) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := settings.validate(); err != nil {
		return err
	}
	data, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(a.stateDir, "settings-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), filepath.Join(a.stateDir, "settings.json"))
}
