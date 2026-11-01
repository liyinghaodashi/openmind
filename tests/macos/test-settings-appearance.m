#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
@interface Probe : NSObject <WKNavigationDelegate>
@property(strong) NSWindow *window;
@property(strong) WKWebView *web;
@property double active;
@end
@implementation Probe
- (void)sample:(BOOL)inactive {
 WKSnapshotConfiguration *config=[WKSnapshotConfiguration new]; config.rect=NSMakeRect(20,22,16,16);
 [self.web takeSnapshotWithConfiguration:config completionHandler:^(NSImage *image,NSError *error){
  if(error){NSLog(@"%@",error);exit(1);}
  NSBitmapImageRep *pixels=[[NSBitmapImageRep alloc] initWithData:image.TIFFRepresentation];
  NSColor *color=[[pixels colorAtX:pixels.pixelsWide/2 y:pixels.pixelsHigh/5] colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
  double brightness=(color.redComponent+color.greenComponent+color.blueComponent)/3;
  printf("%s checked background: %.3f (window key=%d, app active=%d)\n",inactive?"inactive":"active",brightness,self.window.keyWindow,NSApp.active);
  if(inactive){BOOL pass=!NSApp.active&&!self.window.keyWindow&&self.active<.3&&brightness<.3&&fabs(self.active-brightness)<.03;puts(pass?"PASS: checked background remains black":"FAIL: checked background changes on blur");exit(pass?0:1);}
  self.active=brightness;[self.window resignKeyWindow];[[NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.finder"].firstObject activateWithOptions:0];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,400*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[self sample:YES];});
 }];
}
- (void)webView:(WKWebView *)web didFinishNavigation:(WKNavigation *)navigation {
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,400*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[self sample:NO];});
}
@end
int main(int argc,const char *argv[]){@autoreleasepool{
 if(argc!=2){fprintf(stderr,"Usage: test-settings-appearance frontend/styles/app.css\n");return 1;}
 [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];[NSApp finishLaunching];[NSApp activateIgnoringOtherApps:YES];
 Probe *p=[Probe new];p.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(100,100,400,200) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
 p.web=[[WKWebView alloc] initWithFrame:p.window.contentView.bounds];p.web.navigationDelegate=p;[p.window.contentView addSubview:p.web];[p.window makeKeyAndOrderFront:nil];
 NSString *css=[NSString stringWithContentsOfFile:[NSString stringWithUTF8String:argv[1]] encoding:NSUTF8StringEncoding error:nil];
 [p.web loadHTMLString:[NSString stringWithFormat:@"<!doctype html><style>%@ body{margin:0;padding:20px}</style><label class='setting-row'><input type='checkbox' checked><span>已选中</span></label>",css] baseURL:nil];
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,10*NSEC_PER_SEC),dispatch_get_main_queue(),^{puts("timeout");exit(1);});[NSApp run];
}}
