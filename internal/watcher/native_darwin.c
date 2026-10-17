#include "native_darwin.h"
#include <CoreServices/CoreServices.h>
#include <dispatch/dispatch.h>
#include <stdlib.h>

extern void openmindFSEvent(uintptr_t handle);

struct OMWatcher {
    FSEventStreamRef stream;
    dispatch_queue_t queue;
};

static void event_callback(ConstFSEventStreamRef stream, void *info, size_t count,
                           void *paths, const FSEventStreamEventFlags flags[],
                           const FSEventStreamEventId ids[]) {
    openmindFSEvent((uintptr_t)info);
}

static void drain_callback(void *unused) {}

OMWatcher *om_watch_start(const char *path, uintptr_t handle) {
    OMWatcher *watcher = calloc(1, sizeof(OMWatcher));
    if (!watcher) return NULL;
    CFStringRef root = CFStringCreateWithCString(NULL, path, kCFStringEncodingUTF8);
    if (!root) { free(watcher); return NULL; }
    CFArrayRef paths = CFArrayCreate(NULL, (const void **)&root, 1, &kCFTypeArrayCallBacks);
    FSEventStreamContext context = {0, (void *)handle, NULL, NULL, NULL};
    watcher->stream = FSEventStreamCreate(NULL, event_callback, &context, paths,
        kFSEventStreamEventIdSinceNow, 0.075,
        kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagWatchRoot |
        kFSEventStreamCreateFlagNoDefer);
    CFRelease(paths);
    CFRelease(root);
    if (!watcher->stream) { free(watcher); return NULL; }
    watcher->queue = dispatch_queue_create("openmind.fsevents", DISPATCH_QUEUE_SERIAL);
    FSEventStreamSetDispatchQueue(watcher->stream, watcher->queue);
    if (!FSEventStreamStart(watcher->stream)) {
        FSEventStreamInvalidate(watcher->stream);
        FSEventStreamRelease(watcher->stream);
        dispatch_release(watcher->queue);
        free(watcher);
        return NULL;
    }
    return watcher;
}

void om_watch_stop(OMWatcher *watcher) {
    if (!watcher) return;
    FSEventStreamStop(watcher->stream);
    FSEventStreamInvalidate(watcher->stream);
    dispatch_sync_f(watcher->queue, NULL, drain_callback);
    FSEventStreamRelease(watcher->stream);
    dispatch_release(watcher->queue);
    free(watcher);
}
