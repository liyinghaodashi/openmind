package workspace

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/collate"
)

func compareNames(a, b string, order *collate.Collator) int {
	if ar, br := nameRank(a), nameRank(b); ar != br {
		return ar - br
	}
	ap, bp := numberPrefix(a), numberPrefix(b)
	for i := 0; i < len(ap) && i < len(bp); i++ {
		x, y := strings.TrimLeft(ap[i], "0"), strings.TrimLeft(bp[i], "0")
		if len(x) != len(y) {
			return len(x) - len(y)
		}
		if c := strings.Compare(x, y); c != 0 {
			return c
		}
	}
	if len(ap) != len(bp) {
		return len(ap) - len(bp)
	}
	if c := order.CompareString(a, b); c != 0 {
		return c
	}
	return strings.Compare(a, b)
}

func nameRank(name string) int {
	r, _ := utf8.DecodeRuneInString(name)
	if r >= '0' && r <= '9' {
		return 0
	}
	if unicode.Is(unicode.Han, r) {
		return 1
	}
	return 2
}

func numberPrefix(name string) []string {
	var parts []string
	for len(name) > 0 {
		n := 0
		for n < len(name) && name[n] >= '0' && name[n] <= '9' {
			n++
		}
		if n == 0 {
			break
		}
		parts = append(parts, name[:n])
		name = name[n:]
		if !strings.HasPrefix(name, ".") {
			break
		}
		name = name[1:]
	}
	return parts
}
