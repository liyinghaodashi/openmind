package window

/*
#cgo LDFLAGS: -framework Cocoa
void om_toggle_window_maximise(void);
void om_hide_window(void);
int om_set_compact_window(int enabled, int width);
*/
import "C"

import "fmt"

func ToggleMaximise() {
	C.om_toggle_window_maximise()
}

func Hide() {
	C.om_hide_window()
}

func SetCompact(enabled, mind bool) error {
	value := C.int(0)
	if enabled {
		value = 1
	}
	width := C.int(440)
	if mind {
		width = 960
	}
	switch C.om_set_compact_window(value, width) {
	case 0:
		return nil
	case 2:
		return fmt.Errorf("请先退出全屏，再切换便签小窗")
	default:
		return fmt.Errorf("窗口正在切换，请稍后重试")
	}
}
