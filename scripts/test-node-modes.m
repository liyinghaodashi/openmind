#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface NodeModesProbe : NSObject <WKScriptMessageHandler>
@property(nonatomic, weak) WKWebView *web;
@end

@implementation NodeModesProbe
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    NSDictionary *result = message.body;
    if ([message.name isEqualToString:@"historyKey"]) {
        NSEventModifierFlags flags = NSEventModifierFlagCommand;
        if ([result[@"shift"] boolValue]) flags |= NSEventModifierFlagShift;
        [self.web.window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        [self.web.window makeFirstResponder:self.web];
        NSEvent *event = [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:flags timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:self.web.window.windowNumber context:nil characters:@"z" charactersIgnoringModifiers:@"z" isARepeat:NO keyCode:6];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            [NSApp sendEvent:event];
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 150 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
                [self.web evaluateJavaScript:@"window.__mindKeyDone()" completionHandler:nil];
            });
        });
        return;
    }
    if ([message.name isEqualToString:@"pointer"]) {
        NSWindow *window = self.web.window;
        NSPoint point = NSMakePoint([result[@"x"] doubleValue], self.web.bounds.size.height - [result[@"y"] doubleValue]);
        NSInteger count = [result[@"count"] integerValue];
        NSEvent *down = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDown location:point modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil eventNumber:0 clickCount:count pressure:1];
        [NSApp sendEvent:down];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 20 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            NSEvent *up = [NSEvent mouseEventWithType:NSEventTypeLeftMouseUp location:point modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil eventNumber:0 clickCount:count pressure:0];
            [NSApp sendEvent:up];
        });
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 80 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            [self.web evaluateJavaScript:@"window.__nodePointerDone()" completionHandler:nil];
        });
        return;
    }
    printf("%s\n", [result[@"message"] UTF8String]);
    exit([result[@"passed"] boolValue] ? 0 : 1);
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        NSMenu *mainMenu = [NSMenu new];
        NSMenuItem *editItem = [NSMenuItem new];
        NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
        [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
        NSMenuItem *redo = [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
        redo.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
        editItem.submenu = editMenu;
        [mainMenu addItem:editItem];
        NSApp.mainMenu = mainMenu;
        [NSApp finishLaunching];
        [NSApp activateIgnoringOtherApps:YES];
        NodeModesProbe *probe = [NodeModesProbe new];
        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        [configuration.userContentController addScriptMessageHandler:probe name:@"result"];
        [configuration.userContentController addScriptMessageHandler:probe name:@"pointer"];
        [configuration.userContentController addScriptMessageHandler:probe name:@"historyKey"];
        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 1200, 750) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
        window.title = @"OpenMind node mode verification";
        WKWebView *web = [[WKWebView alloc] initWithFrame:window.contentView.bounds configuration:configuration];
        probe.web = web;
        [window.contentView addSubview:web];
        [window makeKeyAndOrderFront:nil];
        [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[NSString stringWithUTF8String:argv[1]]]]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 40 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ fprintf(stderr, "Node mode verification timed out\n"); exit(1); });
        [NSApp run];
    }
}
