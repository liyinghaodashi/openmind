package globalshortcut

import (
	"errors"
	"testing"
)

type fakeRegistration struct{ active, closed bool }

func (r *fakeRegistration) Activate() { r.active = true }
func (r *fakeRegistration) Close()    { r.closed = true }

func TestParse(t *testing.T) {
	for _, value := range []string{"", "Ctrl+F1", "Ctrl+Alt+KeyO", "Alt+Shift+Meta+Space", "Meta+Digit0", "Ctrl+F20"} {
		if _, err := Parse(value); err != nil {
			t.Fatalf("%s: %v", value, err)
		}
	}
	for _, value := range []string{"F1", "Shift+KeyA", "Ctrl+", "Ctrl+F21", "Ctrl+Ctrl+F1", "Meta+Ctrl+KeyO", "Unknown+F1", "Ctrl+Escape"} {
		if _, err := Parse(value); err == nil {
			t.Fatalf("accepted %s", value)
		}
	}
	key, _ := Parse("Ctrl+Alt+Shift+Meta+KeyO")
	if key.Code != 31 || key.Modifiers != 6912 {
		t.Fatalf("wrong macOS binding: %+v", key)
	}
}

func TestReplacementIsTransactional(t *testing.T) {
	var registrations []*fakeRegistration
	failRegistration := false
	m := Manager{Register: func(Key) (Registration, error) {
		if failRegistration {
			return nil, errors.New("occupied")
		}
		r := &fakeRegistration{}
		registrations = append(registrations, r)
		return r, nil
	}}
	save := func() error { return nil }
	if err := m.Update("Ctrl+F1", save); err != nil {
		t.Fatal(err)
	}
	old := registrations[0]
	if !old.active || old.closed {
		t.Fatal("initial registration not active")
	}
	failRegistration = true
	if err := m.Update("Ctrl+F2", func() error { t.Fatal("must not persist occupied key"); return nil }); err == nil {
		t.Fatal("accepted occupied shortcut")
	}
	if old.closed {
		t.Fatal("conflict removed old shortcut")
	}
	failRegistration = false
	if err := m.Update("Ctrl+F2", func() error {
		if old.closed || registrations[1].active {
			t.Fatal("shortcut changed before persistence")
		}
		return errors.New("disk full")
	}); err == nil {
		t.Fatal("accepted failed save")
	}
	if old.closed || !registrations[1].closed || m.current != "Ctrl+F1" {
		t.Fatal("failed save did not roll back")
	}
	if err := m.Update("Ctrl+F1", save); err != nil || len(registrations) != 2 {
		t.Fatal("unchanged shortcut registered twice")
	}
	if err := m.Update("Ctrl+F2", save); err != nil {
		t.Fatal(err)
	}
	if !old.closed || !registrations[2].active {
		t.Fatal("replacement did not retire old key")
	}
	if err := m.Update("", func() error { return errors.New("disk full") }); err == nil || registrations[2].closed {
		t.Fatal("failed clear removed shortcut")
	}
	if err := m.Update("", save); err != nil || !registrations[2].closed {
		t.Fatal("clear did not unregister")
	}
	if err := m.Update("Ctrl+F3", save); err != nil {
		t.Fatal(err)
	}
	m.Close()
	if !registrations[3].closed {
		t.Fatal("shutdown leaked registration")
	}
}
