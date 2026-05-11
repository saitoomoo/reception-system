package visitor

import (
	"testing"
)

func TestIncrementReceptionNumber(t *testing.T) {
	tests := []struct {
		name    string
		last    string
		want    string
		wantErr bool
	}{
		{
			name: "first visitor (empty DB)",
			last: "",
			want: "A-001",
		},
		{
			name: "normal increment",
			last: "A-001",
			want: "A-002",
		},
		{
			name: "mid-sequence",
			last: "A-500",
			want: "A-501",
		},
		{
			name: "last number before rollover",
			last: "A-998",
			want: "A-999",
		},
		{
			name: "rollover A-999 to B-001",
			last: "A-999",
			want: "B-001",
		},
		{
			name: "rollover mid-alphabet",
			last: "M-999",
			want: "N-001",
		},
		{
			name: "last valid letter second-to-last",
			last: "Z-998",
			want: "Z-999",
		},
		{
			name:    "exhausted at Z-999",
			last:    "Z-999",
			wantErr: true,
		},
		{
			name: "invalid format falls back to A-001",
			last: "INVALID",
			want: "A-001",
		},
		{
			name: "wrong separator falls back to A-001",
			last: "A_001",
			want: "A-001",
		},
		{
			name: "non-digit number falls back to A-001",
			last: "A-XYZ",
			want: "A-001",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := incrementReceptionNumber(tt.last)
			if tt.wantErr {
				if err == nil {
					t.Errorf("incrementReceptionNumber(%q) expected error, got nil", tt.last)
				}
				return
			}
			if err != nil {
				t.Errorf("incrementReceptionNumber(%q) unexpected error: %v", tt.last, err)
				return
			}
			if got != tt.want {
				t.Errorf("incrementReceptionNumber(%q) = %q, want %q", tt.last, got, tt.want)
			}
		})
	}
}
