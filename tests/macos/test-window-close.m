#import <Cocoa/Cocoa.h>

void om_hide_window(void);

@interface CloseProbe : NSObject <NSApplicationDelegate>
@property(retain) NSWindow *window;
@end

@implementation CloseProbe
- (void)checkClose:(NSUInteger)remaining {
    om_hide_window();
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.window.visible || !NSApp.running) {
            fprintf(stderr, "Closing the window must leave the application running\n");
            exit(1);
        }
        SEL reopen = @selector(applicationShouldHandleReopen:hasVisibleWindows:);
        if (![self respondsToSelector:reopen]) {
            fprintf(stderr, "Dock reopen handler is missing\n");
            exit(1);
        }
        BOOL (*handleReopen)(id, SEL, NSApplication *, BOOL) = (void *)[self methodForSelector:reopen];
        handleReopen(self, reopen, NSApp, NO);
        if (!self.window.visible || NSApp.keyWindow != self.window) {
            fprintf(stderr, "Dock reopen must restore the same window\n");
            exit(1);
        }
        if (remaining > 1) {
            [self checkClose:remaining - 1];
        } else {
            puts("PASS: repeated window close keeps app running; Dock reopen restores the same window");
            exit(0);
        }
    });
}
@end

int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        CloseProbe *probe = [CloseProbe new];
        NSApp.delegate = probe;
        probe.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 600, 400)
            styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
        probe.window.title = @"OpenMind window close verification";
        [NSApp finishLaunching];
        [probe.window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        dispatch_async(dispatch_get_main_queue(), ^{ [probe checkClose:3]; });
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            fprintf(stderr, "Window close verification timed out\n");
            exit(1);
        });
        [NSApp run];
    }
}
