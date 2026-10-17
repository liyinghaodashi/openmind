package bookmark

/*
#cgo LDFLAGS: -framework Foundation
#include <stdlib.h>
char *om_bookmark_create(const char *path, char **error);
char *om_bookmark_resolve(const char *data, int *stale, char **error);
*/
import "C"

import (
	"errors"
	"unsafe"
)

func Create(path string) (string, error) {
	input := C.CString(path)
	defer C.free(unsafe.Pointer(input))
	var message *C.char
	value := C.om_bookmark_create(input, &message)
	return result(value, message)
}

func Resolve(data string) (string, bool, error) {
	input := C.CString(data)
	defer C.free(unsafe.Pointer(input))
	var message *C.char
	var stale C.int
	value := C.om_bookmark_resolve(input, &stale, &message)
	path, err := result(value, message)
	return path, stale != 0, err
}

func result(value, message *C.char) (string, error) {
	if message != nil {
		defer C.free(unsafe.Pointer(message))
	}
	if value == nil {
		if message != nil {
			return "", errors.New(C.GoString(message))
		}
		return "", errors.New("无法定位原文件夹，请重新选择")
	}
	defer C.free(unsafe.Pointer(value))
	return C.GoString(value), nil
}
