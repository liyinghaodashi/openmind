package globalshortcut

import (
	"fmt"
	"strings"
)

type Key struct {
	Code      uint32
	Modifiers uint32
}

var keyCodes = map[string]uint32{
	"KeyA": 0, "KeyS": 1, "KeyD": 2, "KeyF": 3, "KeyH": 4, "KeyG": 5,
	"KeyZ": 6, "KeyX": 7, "KeyC": 8, "KeyV": 9, "KeyB": 11, "KeyQ": 12,
	"KeyW": 13, "KeyE": 14, "KeyR": 15, "KeyY": 16, "KeyT": 17,
	"Digit1": 18, "Digit2": 19, "Digit3": 20, "Digit4": 21, "Digit6": 22,
	"Digit5": 23, "Digit9": 25, "Digit7": 26, "Digit8": 28, "Digit0": 29,
	"KeyO": 31, "KeyU": 32, "KeyI": 34, "KeyP": 35, "KeyL": 37,
	"KeyJ": 38, "KeyK": 40, "KeyN": 45, "KeyM": 46, "Space": 49,
	"F1": 122, "F2": 120, "F3": 99, "F4": 118, "F5": 96, "F6": 97,
	"F7": 98, "F8": 100, "F9": 101, "F10": 109, "F11": 103, "F12": 111,
	"F13": 105, "F14": 107, "F15": 113, "F16": 106, "F17": 64,
	"F18": 79, "F19": 80, "F20": 90,
}

func Parse(value string) (Key, error) {
	if value == "" {
		return Key{}, nil
	}
	parts := strings.Split(value, "+")
	key, ok := keyCodes[parts[len(parts)-1]]
	if !ok {
		return Key{}, fmt.Errorf("不支持的快捷键主键")
	}
	var modifiers uint32
	previous := -1
	order := []string{"Ctrl", "Alt", "Shift", "Meta"}
	flags := []uint32{4096, 2048, 512, 256}
	for _, part := range parts[:len(parts)-1] {
		index := -1
		for i, name := range order {
			if part == name {
				index = i
			}
		}
		if index <= previous {
			return Key{}, fmt.Errorf("无效的快捷键修饰键")
		}
		previous = index
		modifiers |= flags[index]
	}
	if modifiers&(4096|2048|256) == 0 {
		return Key{}, fmt.Errorf("请至少选择 Control、Option 或 Command 中的一个")
	}
	return Key{Code: key, Modifiers: modifiers}, nil
}

type Registration interface {
	Activate()
	Close()
}

type Manager struct {
	Register func(Key) (Registration, error)
	current  string
	active   Registration
}

func (m *Manager) Update(value string, persist func() error) error {
	key, err := Parse(value)
	if err != nil {
		return err
	}
	if value == m.current {
		return persist()
	}
	var next Registration
	if value != "" {
		next, err = m.Register(key)
		if err != nil {
			return err
		}
	}
	if err := persist(); err != nil {
		if next != nil {
			next.Close()
		}
		return err
	}
	if next != nil {
		next.Activate()
	}
	if m.active != nil {
		m.active.Close()
	}
	m.active, m.current = next, value
	return nil
}

func (m *Manager) Close() {
	if m.active != nil {
		m.active.Close()
	}
	m.active, m.current = nil, ""
}
