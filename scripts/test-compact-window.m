#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

int om_set_compact_window(int enabled);
void om_toggle_window_maximise(void);

@interface CompactProbe : NSObject <WKScriptMessageHandler>
@property(retain) NSWindow *window;
@property NSRect originalFrame;
@property NSSize originalMinSize;
@property NSInteger originalLevel;
@property NSWindowCollectionBehavior originalBehavior;
@property BOOL compact;
@property(copy) NSString *output;
@end

@implementation CompactProbe
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    NSDictionary *data = message.body;
    NSString *action = data[@"action"];
    if (action) {
        NSString *failure = nil;
        if ([action isEqual:@"compact"]) {
            BOOL enabled = [data[@"enabled"] boolValue];
            if (enabled && !self.compact) {
                self.originalFrame = self.window.frame;
                self.originalMinSize = self.window.minSize;
                self.originalLevel = self.window.level;
                self.originalBehavior = self.window.collectionBehavior;
            }
            if (om_set_compact_window(enabled)) failure = @"Native window transition failed";
            else if (enabled) {
                if (fabs(self.window.frame.size.width - 440) > 1 || fabs(self.window.frame.size.height - 580) > 1 ||
                    self.window.level != NSFloatingWindowLevel || self.window.minSize.width != 320 ||
                    ![self.window standardWindowButton:NSWindowCloseButton].hidden ||
                    ![self.window standardWindowButton:NSWindowMiniaturizeButton].hidden ||
                    ![self.window standardWindowButton:NSWindowZoomButton].hidden) failure = @"Compact size, level, constraints or controls incorrect";
            } else {
                if (!NSEqualRects(self.originalFrame, self.window.frame) || !NSEqualSizes(self.originalMinSize, self.window.minSize) ||
                    self.window.level != self.originalLevel || self.window.collectionBehavior != self.originalBehavior ||
                    [self.window standardWindowButton:NSWindowCloseButton].hidden) failure = @"Original window state was not restored";
            }
            self.compact = enabled;
        } else if ([action isEqual:@"pin"]) {
            self.window.level = [data[@"enabled"] boolValue] ? NSFloatingWindowLevel : NSNormalWindowLevel;
        } else if ([action isEqual:@"check-pin"]) {
            NSInteger expected = [data[@"enabled"] boolValue] ? NSFloatingWindowLevel : NSNormalWindowLevel;
            if (self.window.level != expected) failure = @"Pin button and native window level disagree";
        } else if ([action isEqual:@"resize"]) {
            NSRect frame = self.window.frame;
            frame.size = NSMakeSize(580, 700);
            [self.window setFrame:frame display:YES];
            om_toggle_window_maximise();
        } else if ([action isEqual:@"capture"]) {
            [message.webView takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *image, NSError *error) {
                if (error) { NSLog(@"%@", error); exit(1); }
                NSData *png = [[NSBitmapImageRep imageRepWithData:image.TIFFRepresentation] representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                [png writeToFile:[self.output stringByAppendingPathComponent:data[@"name"]] atomically:YES];
                [message.webView evaluateJavaScript:@"window.__compactResolve(null)" completionHandler:nil];
            }];
            return;
        }
        if (failure) { fprintf(stderr, "%s\n", failure.UTF8String); exit(1); }
        dispatch_async(dispatch_get_main_queue(), ^{
            [message.webView evaluateJavaScript:@"window.__compactResolve(null)" completionHandler:nil];
        });
        return;
    }
    printf("%s\n", [data[@"message"] UTF8String]);
    exit([data[@"passed"] boolValue] ? 0 : 1);
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [NSApp finishLaunching];
        CompactProbe *probe = [CompactProbe new];
        probe.output = [NSString stringWithUTF8String:argv[2]];
        NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable | NSWindowStyleMaskFullSizeContentView;
        probe.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 1100, 760) styleMask:style backing:NSBackingStoreBuffered defer:NO];
        probe.window.minSize = NSMakeSize(980, 640);
        probe.window.titleVisibility = NSWindowTitleHidden;
        probe.window.titlebarAppearsTransparent = YES;
        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        [configuration.userContentController addScriptMessageHandler:probe name:@"result"];
        WKWebView *web = [[WKWebView alloc] initWithFrame:probe.window.contentView.bounds configuration:configuration];
        web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        [probe.window.contentView addSubview:web];
        [probe.window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[NSString stringWithUTF8String:argv[1]]]]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 55 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            fprintf(stderr, "Compact window verification timed out\n"); exit(1);
        });
        [NSApp run];
    }
}
