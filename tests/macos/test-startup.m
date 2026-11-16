#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) {
            fprintf(stderr, "Usage: startup-probe /path/OpenMind.app /path/document.md\n");
            return 2;
        }
        [NSApplication sharedApplication];
        NSURL *appURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
        NSURL *fileURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]]];
        NSString *identifier = [[NSBundle bundleWithURL:appURL] bundleIdentifier];
        if (!identifier || ![fileURL checkResourceIsReachableAndReturnError:nil]) {
            fprintf(stderr, "Application or document does not exist\n");
            return 2;
        }
        if ([NSRunningApplication runningApplicationsWithBundleIdentifier:identifier].count) {
            fprintf(stderr, "Quit OpenMind before measuring a cold launch\n");
            return 2;
        }

        CFAbsoluteTime start = CFAbsoluteTimeGetCurrent();
        __block NSRunningApplication *application = nil;
        __block BOOL finished = NO;
        __block int code = 1;
        [[NSWorkspace sharedWorkspace] openURLs:@[fileURL] withApplicationAtURL:appURL
            configuration:[NSWorkspaceOpenConfiguration configuration]
            completionHandler:^(NSRunningApplication *app, NSError *error) {
                if (error || !app || app.processIdentifier <= 0) {
                    fprintf(stderr, "Launch failed: %s\n", error.description.UTF8String ?: "no process");
                    finished = YES;
                    return;
                }
                application = app;
            }];

        NSTimer *timer = [NSTimer scheduledTimerWithTimeInterval:0.01 repeats:YES block:^(NSTimer *timer) {
            if (finished) return;
            double elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000;
            if (application) {
                NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID));
                for (NSDictionary *window in windows) {
                    if ([window[(id)kCGWindowOwnerPID] intValue] != application.processIdentifier ||
                        [window[(id)kCGWindowLayer] intValue] != 0) continue;
                    CGRect bounds;
                    if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds], &bounds) ||
                        bounds.size.width < 400 || bounds.size.height < 300) continue;
                    code = elapsed <= 1500 ? 0 : 1;
                    printf("%s: cold launch window visible in %.0f ms (budget 1500 ms)\n", code ? "FAIL" : "PASS", elapsed);
                    finished = YES;
                    return;
                }
            }
            if (elapsed > 15000) {
                fprintf(stderr, "FAIL: no visible window within 15 seconds\n");
                finished = YES;
            }
        }];
        while (!finished) [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
        [timer invalidate];
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:1]];
        [application terminate];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:3];
        while (application && !application.terminated && deadline.timeIntervalSinceNow > 0) {
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
        if (application && !application.terminated) {
            fprintf(stderr, "Application did not finish quitting; leave it open to handle pending work\n");
            return 1;
        }
        return code;
    }
}
