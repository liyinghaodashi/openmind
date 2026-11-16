#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

void om_toggle_window_maximise(void);

@interface ResizeProbe : NSObject <WKNavigationDelegate>
@property(retain) NSWindow *window;
@property(retain) WKWebView *web;
@property NSRect originalFrame;
@property BOOL restoring;
@end

@implementation ResizeProbe
- (void)checkResize {
    [self.web evaluateJavaScript:@"JSON.stringify({widths, width:innerWidth, font:getComputedStyle(document.body).fontSize})" completionHandler:^(id result, NSError *error) {
        if (error) { NSLog(@"%@", error); exit(1); }
        NSDictionary *sample = [NSJSONSerialization JSONObjectWithData:[result dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
        NSArray *widths = sample[@"widths"];
        double start = [widths.firstObject doubleValue];
        double end = [sample[@"width"] doubleValue];
        double low = MIN(start, end), high = MAX(start, end);
        NSUInteger middleFrames = 0;
        for (NSNumber *width in widths) {
            if (width.doubleValue > low + (high - low) * .2 && width.doubleValue < low + (high - low) * .8) middleFrames++;
        }
        BOOL reducedMotion = NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion;
        BOOL passed = (reducedMotion || middleFrames >= 3) && fabs(end - self.window.contentView.bounds.size.width) < 2 && [sample[@"font"] isEqual:@"16px"];
        printf("%s viewport widths: %s — %s\n", self.restoring ? "restore" : "maximise", [widths.description UTF8String], passed ? "PASS" : "FAIL");
        if (!passed) exit(1);
        if (self.restoring) {
            if (!NSEqualRects(self.originalFrame, self.window.frame)) { fprintf(stderr, "Original window frame was not restored\n"); exit(1); }
            puts("Original position and size restored; text size unchanged: PASS");
            exit(0);
        }
        if (!NSEqualRects(self.window.frame, self.window.screen.visibleFrame)) { fprintf(stderr, "Window did not fill available screen\n"); exit(1); }
        self.restoring = YES;
        [self startResize];
    }];
}
- (void)startResize {
    [self.web evaluateJavaScript:@"window.widths=[innerWidth]" completionHandler:^(id result, NSError *error) {
        if (error) { NSLog(@"%@", error); exit(1); }
        om_toggle_window_maximise();
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 650 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [self checkResize]; });
    }];
}
- (void)webView:(WKWebView *)web didFinishNavigation:(WKNavigation *)navigation {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [self startResize]; });
}
@end

int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [NSApp finishLaunching];
        [NSApp activateIgnoringOtherApps:YES];
        ResizeProbe *probe = [ResizeProbe new];
        probe.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(100, 100, 600, 400) styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
        probe.window.title = @"OpenMind resize verification";
        probe.originalFrame = probe.window.frame;
        probe.web = [[WKWebView alloc] initWithFrame:probe.window.contentView.bounds];
        probe.web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        probe.web.navigationDelegate = probe;
        [probe.window.contentView addSubview:probe.web];
        [probe.window makeKeyAndOrderFront:nil];
        [probe.web loadHTMLString:@"<!doctype html><body style='font-size:16px'>OpenMind resize verification<script>window.widths=[];addEventListener('resize',()=>widths.push(innerWidth))</script></body>" baseURL:nil];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 15 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ fprintf(stderr, "Resize verification timed out\n"); exit(1); });
        [NSApp run];
    }
}
