#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

static char restoreFrameKey;
static char resizeTimerKey;
static char compactWindowKey;
static NSWindow *hiddenWindow;

static NSRect om_visible_frame(NSRect frame, NSScreen *screen) {
    NSRect available = screen.visibleFrame;
    frame.size.width = MIN(frame.size.width, available.size.width);
    frame.size.height = MIN(frame.size.height, available.size.height);
    frame.origin.x = MAX(NSMinX(available), MIN(frame.origin.x, NSMaxX(available) - frame.size.width));
    frame.origin.y = MAX(NSMinY(available), MIN(frame.origin.y, NSMaxY(available) - frame.size.height));
    return frame;
}

int om_set_compact_window(int enabled) {
    __block int result = 0;
    void (^change)(void) = ^{
        NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
        if (!window || window.attachedSheet || objc_getAssociatedObject(window, &resizeTimerKey)) {
            result = 1;
            return;
        }
        if (window.styleMask & NSWindowStyleMaskFullScreen) {
            result = 2;
            return;
        }
        NSDictionary *saved = objc_getAssociatedObject(window, &compactWindowKey);
        if (!!enabled == (saved != nil)) return;
        if (enabled) {
            saved = @{
                @"frame": [NSValue valueWithRect:window.frame],
                @"minSize": [NSValue valueWithSize:window.minSize],
                @"level": @(window.level),
                @"behavior": @(window.collectionBehavior),
                @"closeHidden": @([window standardWindowButton:NSWindowCloseButton].hidden),
                @"miniHidden": @([window standardWindowButton:NSWindowMiniaturizeButton].hidden),
                @"zoomHidden": @([window standardWindowButton:NSWindowZoomButton].hidden)
            };
            objc_setAssociatedObject(window, &compactWindowKey, saved, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            window.minSize = NSMakeSize(320, 360);
            window.level = NSFloatingWindowLevel;
            window.collectionBehavior = (window.collectionBehavior & ~(NSWindowCollectionBehaviorFullScreenPrimary | NSWindowCollectionBehaviorFullScreenAuxiliary)) | NSWindowCollectionBehaviorFullScreenNone;
            for (NSNumber *type in @[@(NSWindowCloseButton), @(NSWindowMiniaturizeButton), @(NSWindowZoomButton)]) {
                [window standardWindowButton:type.integerValue].hidden = YES;
            }
            NSScreen *screen = window.screen ?: NSScreen.mainScreen;
            NSRect available = screen.visibleFrame;
            NSRect target = NSMakeRect(NSMaxX(available) - 464, NSMaxY(available) - 604, 440, 580);
            [window setFrame:om_visible_frame(target, screen) display:YES];
        } else {
            window.minSize = [saved[@"minSize"] sizeValue];
            window.level = [saved[@"level"] integerValue];
            window.collectionBehavior = [saved[@"behavior"] unsignedIntegerValue];
            [window standardWindowButton:NSWindowCloseButton].hidden = [saved[@"closeHidden"] boolValue];
            [window standardWindowButton:NSWindowMiniaturizeButton].hidden = [saved[@"miniHidden"] boolValue];
            [window standardWindowButton:NSWindowZoomButton].hidden = [saved[@"zoomHidden"] boolValue];
            NSRect target = [saved[@"frame"] rectValue];
            NSScreen *screen = nil;
            CGFloat largestArea = 0;
            for (NSScreen *candidate in NSScreen.screens) {
                NSRect overlap = NSIntersectionRect(target, candidate.visibleFrame);
                CGFloat area = overlap.size.width * overlap.size.height;
                if (area > largestArea) { largestArea = area; screen = candidate; }
            }
            [window setFrame:om_visible_frame(target, screen ?: window.screen ?: NSScreen.mainScreen) display:YES];
            objc_setAssociatedObject(window, &compactWindowKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
    };
    if (NSThread.isMainThread) change();
    else dispatch_sync(dispatch_get_main_queue(), change);
    return result;
}

static BOOL om_reopen_window(id delegate, SEL selector, NSApplication *application, BOOL hasVisibleWindows) {
    if (hiddenWindow && !hiddenWindow.visible) {
        [hiddenWindow makeKeyAndOrderFront:nil];
        [application activateIgnoringOtherApps:YES];
    }
    return YES;
}

void om_hide_window(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
        if (!window || window.attachedSheet) return;
        class_addMethod([NSApp.delegate class], @selector(applicationShouldHandleReopen:hasVisibleWindows:),
            (IMP)om_reopen_window, [[NSString stringWithFormat:@"%s@:@%s", @encode(BOOL), @encode(BOOL)] UTF8String]);
        hiddenWindow = window;
        [window orderOut:nil];
    });
}

void om_animate_window_frame(NSWindow *window, NSRect target) {
    if (objc_getAssociatedObject(window, &resizeTimerKey)) return;
    NSRect start = window.frame;
    if (NSEqualRects(start, target)) return;
    if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
        [window setFrame:target display:YES animate:NO];
        return;
    }
    NSTimeInterval began = NSProcessInfo.processInfo.systemUptime;
    NSTimer *timer = [NSTimer timerWithTimeInterval:1.0 / 60.0 repeats:YES block:^(NSTimer *tick) {
        if (!window.visible || window.miniaturized || (window.styleMask & NSWindowStyleMaskFullScreen)) {
            [tick invalidate];
            objc_setAssociatedObject(window, &resizeTimerKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            return;
        }
        double progress = MIN(1.0, (NSProcessInfo.processInfo.systemUptime - began) / .24);
        double eased = progress * progress * (3.0 - 2.0 * progress);
        NSRect frame = NSMakeRect(
            start.origin.x + (target.origin.x - start.origin.x) * eased,
            start.origin.y + (target.origin.y - start.origin.y) * eased,
            start.size.width + (target.size.width - start.size.width) * eased,
            start.size.height + (target.size.height - start.size.height) * eased);
        [window setFrame:frame display:YES animate:NO];
        if (progress >= 1.0) {
            [tick invalidate];
            objc_setAssociatedObject(window, &resizeTimerKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
    }];
    objc_setAssociatedObject(window, &resizeTimerKey, timer, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [NSRunLoop.mainRunLoop addTimer:timer forMode:NSRunLoopCommonModes];
}

void om_toggle_window_maximise(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
        if (!window || window.attachedSheet || !(window.styleMask & NSWindowStyleMaskResizable) ||
            (window.styleMask & NSWindowStyleMaskFullScreen) || objc_getAssociatedObject(window, &resizeTimerKey) ||
            objc_getAssociatedObject(window, &compactWindowKey)) return;
        NSScreen *screen = window.screen;
        if (!screen) return;
        NSRect available = screen.visibleFrame;
        NSRect current = window.frame;
        BOOL maximised = fabs(current.origin.x - available.origin.x) < 2 &&
            fabs(current.origin.y - available.origin.y) < 2 &&
            fabs(current.size.width - available.size.width) < 2 &&
            fabs(current.size.height - available.size.height) < 2;
        NSRect target = available;
        if (maximised) {
            NSValue *saved = objc_getAssociatedObject(window, &restoreFrameKey);
            if (saved) {
                target = saved.rectValue;
                target.size.width = MIN(target.size.width, available.size.width);
                target.size.height = MIN(target.size.height, available.size.height);
                target.origin.x = MAX(NSMinX(available), MIN(target.origin.x, NSMaxX(available) - target.size.width));
                target.origin.y = MAX(NSMinY(available), MIN(target.origin.y, NSMaxY(available) - target.size.height));
            } else {
                target.size.width = MIN(1440, available.size.width * .85);
                target.size.height = MIN(900, available.size.height * .85);
                target.origin.x = NSMidX(available) - target.size.width / 2;
                target.origin.y = NSMidY(available) - target.size.height / 2;
            }
        } else {
            objc_setAssociatedObject(window, &restoreFrameKey, [NSValue valueWithRect:current], OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        om_animate_window_frame(window, target);
    });
}
