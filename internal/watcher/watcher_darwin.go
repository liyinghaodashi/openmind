package watcher

/*
#cgo LDFLAGS: -framework CoreServices -framework CoreFoundation
#include "native_darwin.h"
#include <stdlib.h>
*/
import "C"

import (
	"fmt"
	"runtime/cgo"
	"sync"
	"unsafe"
)

type Watcher struct {
	native *C.OMWatcher
	handle cgo.Handle
	events chan struct{}
	done   chan struct{}
	ended  chan struct{}
	once   sync.Once
}

func Start(root string, changed func()) (*Watcher, error) {
	w := &Watcher{events: make(chan struct{}, 1), done: make(chan struct{}), ended: make(chan struct{})}
	w.handle = cgo.NewHandle(w)
	path := C.CString(root)
	defer C.free(unsafe.Pointer(path))
	w.native = C.om_watch_start(path, C.uintptr_t(w.handle))
	if w.native == nil {
		w.handle.Delete()
		return nil, fmt.Errorf("无法启动 macOS FSEvents")
	}
	go func() {
		defer close(w.ended)
		for {
			select {
			case <-w.done:
				return
			case <-w.events:
				changed()
			}
		}
	}()
	return w, nil
}

//export openmindFSEvent
func openmindFSEvent(handle C.uintptr_t) {
	w := cgo.Handle(handle).Value().(*Watcher)
	select {
	case w.events <- struct{}{}:
	default:
	}
}

func (w *Watcher) Close() {
	w.once.Do(func() { C.om_watch_stop(w.native); w.handle.Delete(); close(w.done); <-w.ended })
}
