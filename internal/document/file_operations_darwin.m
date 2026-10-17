#import <Foundation/Foundation.h>
#include <string.h>

char *om_trash_file(const char *path) {
    @autoreleasepool {
        NSString *name = [[NSFileManager defaultManager] stringWithFileSystemRepresentation:path length:strlen(path)];
        NSURL *url = [NSURL fileURLWithPath:name];
        NSError *error = nil;
        if ([[NSFileManager defaultManager] trashItemAtURL:url resultingItemURL:nil error:&error]) {
            return NULL;
        }
        const char *message = [[error localizedDescription] UTF8String];
        return strdup(message ? message : "Unable to move file to Trash");
    }
}
