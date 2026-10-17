package document

/*
#cgo LDFLAGS: -framework Foundation
#include <stdlib.h>
char *om_trash_file(const char *path);
*/
import "C"

import (
	"errors"
	"unsafe"

	"golang.org/x/sys/unix"
)

func renameFile(from, to string) error {
	return unix.RenamexNp(from, to, unix.RENAME_EXCL|unix.RENAME_NOFOLLOW_ANY)
}

func trashFile(path string) error {
	name := C.CString(path)
	defer C.free(unsafe.Pointer(name))
	message := C.om_trash_file(name)
	if message == nil {
		return nil
	}
	defer C.free(unsafe.Pointer(message))
	return errors.New(C.GoString(message))
}
