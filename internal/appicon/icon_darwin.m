#import <Cocoa/Cocoa.h>

void om_set_application_icon(const void *bytes, size_t length) {
    NSData *data = bytes ? [[NSData alloc] initWithBytes:bytes length:length] : nil;
    dispatch_async(dispatch_get_main_queue(), ^{
        @autoreleasepool {
            NSImage *image = data ? [[NSImage alloc] initWithData:data] : nil;
            if (!data || image) {
                [NSApp setApplicationIconImage:image];
            }
            [image release];
            [data release];
        }
    });
}
