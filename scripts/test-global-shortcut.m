#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>

int om_register_shortcut(unsigned int code, unsigned int modifiers, uintptr_t *handle);
void om_activate_shortcut(uintptr_t handle);
void om_unregister_shortcut(uintptr_t handle);
void om_hide_window(void);

static NSWindow *window;
static uintptr_t first, second;
static CGKeyCode primaryKey = kVK_F1, replacementKey = kVK_F2;
static void check(BOOL condition, const char *message) {
    if (!condition) { fprintf(stderr, "FAIL: %s\n", message); exit(1); }
}
static void later(void (^action)(void)) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 800 * NSEC_PER_MSEC), dispatch_get_main_queue(), action);
}
static void press(CGKeyCode code) {
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    for (NSNumber *modifier in @[@(kVK_Control), @(kVK_Option)]) {
        CGEventRef event = CGEventCreateKeyboardEvent(source, modifier.unsignedShortValue, true);
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
    }
    for (int down = 1; down >= 0; down--) {
        CGEventRef event = CGEventCreateKeyboardEvent(source, code, down);
        CGEventSetFlags(event, kCGEventFlagMaskControl | kCGEventFlagMaskAlternate | (code == kVK_F20 ? 0 : kCGEventFlagMaskSecondaryFn));
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
    }
    for (NSNumber *modifier in @[@(kVK_Option), @(kVK_Control)]) {
        CGEventRef event = CGEventCreateKeyboardEvent(source, modifier.unsignedShortValue, false);
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
    }
    CFRelease(source);
}
static void background(void) {
    [[NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.finder"].firstObject activateWithOptions:0];
}
static void verifyFocus(void) {
    check(NSApp.active && window.keyWindow && window.visible && !window.miniaturized, "shortcut must activate and restore the original window");
}
static void runPhase(int phase) {
    if (phase == 6) {
        om_unregister_shortcut(second);
        background();
        later(^{ press(replacementKey); later(^{ check(!NSApp.active, "cleared shortcut must not activate app"); puts("PASS: real global hotkey registration, background focus, window hide, app hide, minimisation, replacement and release"); exit(0); }); });
        return;
    }
    if (phase == 1) om_hide_window();
    if (phase == 2) [NSApp hide:nil];
    if (phase == 3) [window miniaturize:nil];
    if (phase == 4) {
        check(om_register_shortcut(replacementKey, controlKey | optionKey, &second) == 0, "replacement registration failed");
        om_activate_shortcut(second);
        om_unregister_shortcut(first);
    }
    background();
    later(^{
        check(!NSApp.active, "test must begin with another app focused");
        if (phase == 1) check(!window.visible, "window hide failed");
        if (phase == 2) check(NSApp.hidden, "app hide failed");
        if (phase == 3) check(window.miniaturized, "minimisation failed");
        press(phase == 5 ? replacementKey : primaryKey);
        later(^{
            if (phase == 4) check(!NSApp.active, "old shortcut must stop activating after replacement");
            else verifyFocus();
            runPhase(phase + 1);
        });
    });
}
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc > 1 && strcmp(argv[1], "extended") == 0) { primaryKey = kVK_F19; replacementKey = kVK_F20; }
        if (!AXIsProcessTrusted()) { fprintf(stderr, "Native shortcut probe needs existing Accessibility permission for simulated key presses. No permission settings were changed.\n"); return 2; }
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        [NSApp finishLaunching];
        window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 640, 400) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskMiniaturizable backing:NSBackingStoreBuffered defer:NO];
        window.title = @"OpenMind global shortcut verification";
        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        CFArrayRef symbolic = NULL;
        check(CopySymbolicHotKeys(&symbolic) == noErr, "cannot read system shortcuts");
        for (NSDictionary *shortcut in (__bridge NSArray *)symbolic) {
            if (![shortcut[(__bridge NSString *)kHISymbolicHotKeyEnabled] boolValue]) continue;
            uintptr_t reserved;
            check(om_register_shortcut([shortcut[(__bridge NSString *)kHISymbolicHotKeyCode] unsignedIntValue],
                [shortcut[(__bridge NSString *)kHISymbolicHotKeyModifiers] unsignedIntValue], &reserved) == 1, "system shortcut must be rejected");
            break;
        }
        CFRelease(symbolic);
        check(om_register_shortcut(primaryKey, controlKey | optionKey, &first) == 0, "initial registration failed");
        uintptr_t duplicate;
        check(om_register_shortcut(primaryKey, controlKey | optionKey, &duplicate) != 0, "duplicate registration must fail");
        om_activate_shortcut(first);
        later(^{ runPhase(0); });
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ check(NO, "native shortcut test timed out"); });
        [NSApp run];
    }
}
