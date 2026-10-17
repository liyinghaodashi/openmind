package appicon

/*
#cgo LDFLAGS: -framework Cocoa
#include <stddef.h>
void om_set_application_icon(const void *bytes, size_t length);
*/
import "C"

import (
	_ "embed"
	"unsafe"
)

//go:embed assets/anime-02a.png
var animePNG []byte

func Apply() {
	C.om_set_application_icon(unsafe.Pointer(&animePNG[0]), C.size_t(len(animePNG)))
}
