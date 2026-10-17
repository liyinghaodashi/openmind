package document

import "syscall"

func syscallNoFollow() int { return syscall.O_NOFOLLOW }
