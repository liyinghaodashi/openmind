package window

/*
#cgo LDFLAGS: -framework Cocoa
void om_toggle_window_maximise(void);
void om_hide_window(void);
int om_set_compact_window(int enabled);
*/
import "C"

import "fmt"

func ToggleMaximise() {
	C.om_toggle_window_maximise()
}

func Hide() {
	C.om_hide_window()
}

func SetCompact(enabled bool) error {
	value := C.int(0)
	if enabled {
		value = 1
	}
	switch C.om_set_compact_window(value) {
	case 0:
		return nil
	case 2:
		return fmt.Errorf("请先退出全屏，再切换便签小窗")
	default:
		return fmt.Errorf("窗口正在切换，请稍后重试")
	}
}
