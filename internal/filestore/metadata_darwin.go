package filestore

/*
#cgo LDFLAGS: -framework CoreServices
#include <copyfile.h>
#include <stdlib.h>
#include <errno.h>
static int metadata_copy(const char *from, const char *to) {
  if (copyfile(from, to, NULL, COPYFILE_ACL | COPYFILE_XATTR) == 0) return 0;
  return errno;
}
*/
import "C"
import (
	"fmt"
	"unsafe"
)

func copyMetadata(from, to string) error {
	a, b := C.CString(from), C.CString(to)
	defer C.free(unsafe.Pointer(a))
	defer C.free(unsafe.Pointer(b))
	if e := C.metadata_copy(a, b); e != 0 {
		return fmt.Errorf("保留文件元数据失败：errno %d", int(e))
	}
	return nil
}
