import AppKit
let args = CommandLine.arguments
let icon = args.count > 2 ? NSImage(contentsOfFile: args[2]) : nil
if !NSWorkspace.shared.setIcon(icon, forFile: args[1], options: []) { exit(1) }
print("Custom icon updated")
