#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

@interface PinProbe : NSObject <WKScriptMessageHandler>
@property(strong) NSWindow *window;
@property(copy) NSString *output;
@property(strong) NSData *pinBaseline;
@property(strong) SCContentFilter *pinFilter;
@end

@implementation PinProbe
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    NSDictionary *data = message.body;
    NSString *action = data[@"action"];
    if (action) {
        if ([action isEqual:@"pin"]) {
            self.window.level = [data[@"enabled"] boolValue] ? NSFloatingWindowLevel : NSNormalWindowLevel;
        } else if ([action isEqual:@"check-pin"]) {
            NSInteger expected = [data[@"enabled"] boolValue] ? NSFloatingWindowLevel : NSNormalWindowLevel;
            if (self.window.level != expected) { fprintf(stderr, "Incorrect native pin level\n"); exit(1); }
        } else if ([action isEqual:@"pin-sample"]) {
            void (^capture)(void) = ^{
                SCStreamConfiguration *configuration = [SCStreamConfiguration new];
                configuration.sourceRect = CGRectMake([data[@"x"] doubleValue], [data[@"y"] doubleValue], [data[@"width"] doubleValue], [data[@"height"] doubleValue]);
                configuration.width = [data[@"width"] doubleValue] * self.window.backingScaleFactor;
                configuration.height = [data[@"height"] doubleValue] * self.window.backingScaleFactor;
                configuration.showsCursor = NO;
                configuration.ignoreShadowsSingleWindow = YES;
                [SCScreenshotManager captureImageWithFilter:self.pinFilter configuration:configuration completionHandler:^(CGImageRef image, NSError *error) {
                    if (error) { NSLog(@"%@", error); exit(1); }
                    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:image];
                    NSData *pixels = [NSData dataWithBytes:bitmap.bitmapData length:bitmap.bytesPerRow * bitmap.pixelsHigh];
                    if ([data[@"baseline"] boolValue]) self.pinBaseline = pixels;
                    NSUInteger changed = 0;
                    if (pixels.length != self.pinBaseline.length) changed = pixels.length;
                    else {
                        const unsigned char *before = self.pinBaseline.bytes, *after = pixels.bytes;
                        for (NSUInteger i = 0; i < pixels.length; i++) if (before[i] != after[i]) changed++;
                    }
                    if ([data[@"baseline"] boolValue] || changed) {
                        NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                        [png writeToFile:[self.output stringByAppendingPathComponent:[data[@"baseline"] boolValue] ? @"pin-before.png" : @"pin-changed.png"] atomically:YES];
                    }
                    dispatch_async(dispatch_get_main_queue(), ^{
                        [message.webView evaluateJavaScript:[NSString stringWithFormat:@"window.__compactResolve(%lu)", (unsigned long)changed] completionHandler:nil];
                    });
                }];
            };
            if (self.pinFilter) capture();
            else [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *error) {
                if (error) { NSLog(@"%@", error); exit(1); }
                for (SCWindow *window in content.windows) if (window.windowID == self.window.windowNumber) {
                    self.pinFilter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:window];
                    dispatch_async(dispatch_get_main_queue(), capture);
                    return;
                }
                fprintf(stderr, "Cannot find probe window for capture\n"); exit(1);
            }];
            return;
        } else { fprintf(stderr, "Unknown pin probe action\n"); exit(1); }
        [message.webView evaluateJavaScript:@"window.__compactResolve(null)" completionHandler:nil];
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
        PinProbe *probe = [PinProbe new];
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
            fprintf(stderr, "Pin verification timed out\n"); exit(1);
        });
        [NSApp run];
    }
}
