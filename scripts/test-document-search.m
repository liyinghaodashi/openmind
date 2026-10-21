#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface SearchProbe : NSObject <WKScriptMessageHandler>
@end

@implementation SearchProbe
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    NSDictionary *result = message.body;
    if ([result[@"inputAction"] isEqualToString:@"enter"]) {
        NSWindow *window = message.webView.window;
        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        for (NSNumber *type in @[@(NSEventTypeKeyDown), @(NSEventTypeKeyUp)]) {
            NSEvent *event = [NSEvent keyEventWithType:type.unsignedIntegerValue location:NSZeroPoint modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil characters:@"\r" charactersIgnoringModifiers:@"\r" isARepeat:NO keyCode:36];
            [NSApp sendEvent:event];
        }
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 150 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            [message.webView evaluateJavaScript:@"window.nativeInputDone()" completionHandler:nil];
        });
        return;
    }
    if (result[@"inputAction"]) {
        id<NSTextInputClient> target = (id)[NSApp keyWindow].firstResponder;
        if (![target respondsToSelector:@selector(setMarkedText:selectedRange:replacementRange:)]) {
            fprintf(stderr, "First responder does not support native text input\n"); exit(1);
        }
        NSString *text = result[@"text"] ?: @"";
        if ([result[@"inputAction"] isEqualToString:@"mark"]) {
            [target setMarkedText:text selectedRange:NSMakeRange(text.length, 0) replacementRange:NSMakeRange(NSNotFound, 0)];
        } else {
            [target insertText:text replacementRange:NSMakeRange(NSNotFound, 0)];
        }
        [message.webView evaluateJavaScript:@"window.nativeInputDone()" completionHandler:nil];
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
        [NSApp finishLaunching];
        [NSApp activateIgnoringOtherApps:YES];
        SearchProbe *probe = [SearchProbe new];
        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        [configuration.userContentController addScriptMessageHandler:probe name:@"result"];
        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 1200, 750) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
        window.title = @"OpenMind search verification";
        WKWebView *web = [[WKWebView alloc] initWithFrame:window.contentView.bounds configuration:configuration];
        [window.contentView addSubview:web];
        [window makeKeyAndOrderFront:nil];
        [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[NSString stringWithUTF8String:argv[1]]]]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 40 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ fprintf(stderr, "Search verification timed out\n"); exit(1); });
        [NSApp run];
    }
}
