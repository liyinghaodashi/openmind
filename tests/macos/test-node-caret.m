#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface CaretProbe : NSObject <WKScriptMessageHandler>
@end

@implementation CaretProbe
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    NSDictionary *result = message.body;
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
        CaretProbe *probe = [CaretProbe new];
        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        [configuration.userContentController addScriptMessageHandler:probe name:@"result"];
        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 1000, 650) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
        window.title = @"OpenMind caret verification";
        WKWebView *web = [[WKWebView alloc] initWithFrame:window.contentView.bounds configuration:configuration];
        [window.contentView addSubview:web];
        [window makeKeyAndOrderFront:nil];
        NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [web loadFileURL:url allowingReadAccessToURL:url.URLByDeletingLastPathComponent]; });
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ fprintf(stderr, "Caret verification timed out\n"); exit(1); });
        [NSApp run];
    }
}
