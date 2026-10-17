#import <Foundation/Foundation.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/fsgetpath.h>
#include <limits.h>
#include <string.h>

static NSDictionary *directory_identity(NSURL *url) {
    struct stat stat;
    NSString *volume = nil;
    if (lstat(url.path.fileSystemRepresentation, &stat) != 0 || !S_ISDIR(stat.st_mode)) return nil;
    if (![url getResourceValue:&volume forKey:NSURLVolumeUUIDStringKey error:nil] || !volume) return nil;
    return @{ @"volume": volume, @"inode": @((uint64_t)stat.st_ino),
              @"birth": [NSString stringWithFormat:@"%lld:%lld", (long long)stat.st_birthtimespec.tv_sec, (long long)stat.st_birthtimespec.tv_nsec] };
}

static BOOL same_directory(NSURL *url, NSDictionary *reference) {
    NSDictionary *identity = directory_identity(url);
    return identity && [identity[@"volume"] isEqual:reference[@"volume"]]
        && [identity[@"inode"] isEqual:reference[@"inode"]]
        && [identity[@"birth"] isEqual:reference[@"birth"]];
}

static NSURL *locate_directory(NSURL *candidate, NSDictionary *reference) {
    NSURL *ancestor = candidate;
    struct statfs filesystem;
    while (statfs(ancestor.path.fileSystemRepresentation, &filesystem) != 0) {
        NSURL *parent = ancestor.URLByDeletingLastPathComponent;
        if ([parent.path isEqual:ancestor.path]) return nil;
        ancestor = parent;
    }
    NSString *volume = nil;
    if (![ancestor getResourceValue:&volume forKey:NSURLVolumeUUIDStringKey error:nil]
        || ![volume isEqual:reference[@"volume"]]) return nil;
    char path[PATH_MAX];
    if (fsgetpath(path, sizeof(path), &filesystem.f_fsid, [reference[@"inode"] unsignedLongLongValue]) < 0) return nil;
    NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path] isDirectory:YES];
    return same_directory(url, reference) ? url : nil;
}

char *om_bookmark_create(const char *path, char **message) {
    @autoreleasepool {
        NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path] isDirectory:YES];
        NSError *error = nil;
        NSData *data = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithoutImplicitSecurityScope includingResourceValuesForKeys:nil relativeToURL:nil error:&error];
        NSDictionary *identity = directory_identity(url);
        if (!data || !identity) {
            *message = strdup(error.localizedDescription.UTF8String ?: "无法记录文件夹引用");
            return NULL;
        }
        NSMutableDictionary *reference = [[identity mutableCopy] autorelease];
        reference[@"data"] = [data base64EncodedStringWithOptions:0];
        reference[@"path"] = url.path;
        NSData *encoded = [NSJSONSerialization dataWithJSONObject:reference options:NSJSONWritingSortedKeys error:&error];
        if (!encoded) {
            *message = strdup(error.localizedDescription.UTF8String ?: "无法记录文件夹引用");
            return NULL;
        }
        return strdup([[[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding] autorelease].UTF8String);
    }
}

char *om_bookmark_resolve(const char *encoded, int *stale, char **message) {
    @autoreleasepool {
        NSError *error = nil;
        NSData *json = [[NSString stringWithUTF8String:encoded] dataUsingEncoding:NSUTF8StringEncoding];
        id reference = [NSJSONSerialization JSONObjectWithData:json options:0 error:&error];
        if (![reference isKindOfClass:[NSDictionary class]]
            || ![reference[@"data"] isKindOfClass:[NSString class]]
            || ![reference[@"path"] isKindOfClass:[NSString class]]
            || ![reference[@"volume"] isKindOfClass:[NSString class]]
            || ![reference[@"inode"] isKindOfClass:[NSNumber class]]
            || ![reference[@"birth"] isKindOfClass:[NSString class]]) {
            *message = strdup("文件夹引用无效，请重新选择");
            return NULL;
        }
        NSData *data = [[[NSData alloc] initWithBase64EncodedString:reference[@"data"] options:0] autorelease];
        BOOL outdated = NO;
        NSURL *url = data ? [NSURL URLByResolvingBookmarkData:data options:NSURLBookmarkResolutionWithoutUI | NSURLBookmarkResolutionWithoutMounting relativeToURL:nil bookmarkDataIsStale:&outdated error:&error] : nil;
        if (!url || !same_directory(url, reference)) {
            NSURL *candidate = url ?: [NSURL fileURLWithPath:reference[@"path"] isDirectory:YES];
            url = locate_directory(candidate, reference);
            outdated = YES;
        }
        if (!url) {
            *message = strdup(error.localizedDescription.UTF8String ?: "无法定位原文件夹，请重新选择");
            return NULL;
        }
        *stale = outdated;
        return strdup(url.path.fileSystemRepresentation);
    }
}
