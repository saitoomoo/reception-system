package visitor

import (
	"fmt"
	"strconv"
)

// incrementReceptionNumber returns the next reception number after last.
// Format: single uppercase letter + "-" + 3-digit zero-padded number (e.g. "A-001").
// Sequence: A-001 … A-999 → B-001 … Z-999.
// Returns "A-001" if last is empty or malformed.
// Returns an error if the sequence is exhausted (last == "Z-999").
func incrementReceptionNumber(last string) (string, error) {
	if last == "" {
		return "A-001", nil
	}

	if len(last) != 5 || last[1] != '-' {
		return "A-001", nil
	}

	letter := last[0]
	if letter < 'A' || letter > 'Z' {
		return "A-001", nil
	}

	num, err := strconv.Atoi(last[2:])
	if err != nil {
		return "A-001", nil
	}

	if num < 999 {
		return fmt.Sprintf("%c-%03d", letter, num+1), nil
	}

	// Rollover: move to the next letter.
	if letter >= 'Z' {
		return "", fmt.Errorf("reception number exhausted: reached Z-999")
	}
	return fmt.Sprintf("%c-001", letter+1), nil
}
