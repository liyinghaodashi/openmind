package globalshortcut

/*
#cgo LDFLAGS: -framework Cocoa -framework Carbon
#include <stdint.h>
int om_register_shortcut(unsigned int code, unsigned int modifiers, uintptr_t *handle);
void om_activate_shortcut(uintptr_t handle);
void om_unregister_shortcut(uintptr_t handle);
*/
import "C"

import "fmt"

type nativeRegistration struct{ handle C.uintptr_t }

func Register(key Key) (Registration, error) {
	var handle C.uintptr_t
	status := C.om_register_shortcut(C.uint(key.Code), C.uint(key.Modifiers), &handle)
	if status == 1 {
		return nil, fmt.Errorf("此组合键已被 macOS 系统使用，请更换组合键或自行调整系统快捷键")
	}
	if status != 0 {
		return nil, fmt.Errorf("无法注册全局快捷键，可能已被其他应用占用（%d）", status)
	}
	return &nativeRegistration{handle}, nil
}

func (r *nativeRegistration) Activate() { C.om_activate_shortcut(r.handle) }
func (r *nativeRegistration) Close()    { C.om_unregister_shortcut(r.handle) }
