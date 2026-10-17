#ifndef OPENMIND_WATCHER_H
#define OPENMIND_WATCHER_H
#include <stdint.h>
typedef struct OMWatcher OMWatcher;
OMWatcher *om_watch_start(const char *path, uintptr_t handle);
void om_watch_stop(OMWatcher *watcher);
#endif
