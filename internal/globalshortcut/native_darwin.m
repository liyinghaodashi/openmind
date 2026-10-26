#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>

typedef struct {
    EventHotKeyRef ref;
    UInt32 identifier;
} OMShortcut;

static EventHandlerRef shortcutHandler;
static UInt32 nextIdentifier;
static UInt32 activeIdentifier;
static NSWindow *shortcutWindow;

static void onMain(void (^action)(void)) {
    if (NSThread.isMainThread) action();
    else dispatch_sync(dispatch_get_main_queue(), action);
}

static OSStatus handleShortcut(EventHandlerCallRef handler, EventRef event, void *context) {
    EventHotKeyID identifier;
    OSStatus result = GetEventParameter(event, kEventParamDirectObject, typeEventHotKeyID, NULL, sizeof(identifier), NULL, &identifier);
    if (result != noErr || identifier.signature != 'OMWK' || identifier.id != activeIdentifier) return eventNotHandledErr;
    NSWindow *window = shortcutWindow;
    if (!window) return eventNotHandledErr;
    dispatch_async(dispatch_get_main_queue(), ^{
        [NSApp unhideWithoutActivation];
        if (window.miniaturized) [window deminiaturize:nil];
        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        if (window.attachedSheet) [window.attachedSheet makeKeyAndOrderFront:nil];
    });
    return noErr;
}

int om_register_shortcut(unsigned int code, unsigned int modifiers, uintptr_t *handle) {
    __block OSStatus result = noErr;
    onMain(^{
        CFArrayRef shortcuts = NULL;
        result = CopySymbolicHotKeys(&shortcuts);
        if (result != noErr) return;
        for (NSDictionary *shortcut in (__bridge NSArray *)shortcuts) {
            if ([shortcut[(__bridge NSString *)kHISymbolicHotKeyEnabled] boolValue] &&
                [shortcut[(__bridge NSString *)kHISymbolicHotKeyCode] unsignedIntValue] == code &&
                [shortcut[(__bridge NSString *)kHISymbolicHotKeyModifiers] unsignedIntValue] == modifiers) {
                result = 1;
                break;
            }
        }
        CFRelease(shortcuts);
        if (result != noErr) return;
        if (!shortcutHandler) {
            EventTypeSpec type = {kEventClassKeyboard, kEventHotKeyPressed};
            result = InstallEventHandler(GetApplicationEventTarget(), handleShortcut, 1, &type, NULL, &shortcutHandler);
            if (result != noErr) return;
        }
        OMShortcut *registration = calloc(1, sizeof(OMShortcut));
        if (!registration) { result = memFullErr; return; }
        registration->identifier = ++nextIdentifier;
        EventHotKeyID identifier = {'OMWK', registration->identifier};
        result = RegisterEventHotKey(code, modifiers, identifier, GetApplicationEventTarget(), kEventHotKeyExclusive, &registration->ref);
        if (result != noErr) { free(registration); return; }
        NSWindow *window = NSApp.mainWindow ?: NSApp.keyWindow;
        if (window && ![window isKindOfClass:NSPanel.class]) shortcutWindow = window;
        if (!shortcutWindow) {
            for (NSWindow *candidate in NSApp.windows) {
                if ((candidate.styleMask & NSWindowStyleMaskTitled) && ![candidate isKindOfClass:NSPanel.class]) {
                    shortcutWindow = candidate;
                    break;
                }
            }
        }
        *handle = (uintptr_t)registration;
    });
    return result;
}

void om_activate_shortcut(uintptr_t handle) {
    onMain(^{ activeIdentifier = ((OMShortcut *)handle)->identifier; });
}

void om_unregister_shortcut(uintptr_t handle) {
    onMain(^{
        OMShortcut *registration = (OMShortcut *)handle;
        if (activeIdentifier == registration->identifier) activeIdentifier = 0;
        UnregisterEventHotKey(registration->ref);
        free(registration);
    });
}
