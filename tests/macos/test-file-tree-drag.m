#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface FileDragProbe : NSObject <WKScriptMessageHandler>
@end

@implementation FileDragProbe
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
        FileDragProbe *probe = [FileDragProbe new];
        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        [configuration.userContentController addScriptMessageHandler:probe name:@"result"];
        NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 1200, 750) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
        window.title = @"OpenMind file drag verification";
        WKWebView *web = [[WKWebView alloc] initWithFrame:window.contentView.bounds configuration:configuration];
        [window.contentView addSubview:web];
        [window makeKeyAndOrderFront:nil];
        [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[NSString stringWithUTF8String:argv[1]]]]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 40 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            [web evaluateJavaScript:@"JSON.stringify({ready:document.readyState,fixture:!!window.__fileDragFixture,checks:window.__fileDragFixture?.checks,visibility:document.visibilityState,rows:document.querySelectorAll('.tree-row').length})" completionHandler:^(id result, NSError *error) {
                fprintf(stderr, "File drag verification timed out: %s\n", [[result description] UTF8String]); exit(1);
            }];
        });
        [NSApp run];
    }
}
