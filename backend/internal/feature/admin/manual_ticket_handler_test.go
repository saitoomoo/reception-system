package admin

import (
	"testing"

	"connectrpc.com/connect"
)

func TestValidateManualTicketRequest(t *testing.T) {
	const (
		validGuardian  = "山田 太郎"
		validConsent   = "リスク説明文のスナップショット"
		validPaperForm = "P-0042"
	)

	tests := []struct {
		name            string
		ages            []int32
		paperFormID     string
		guardianName    string
		consentSnapshot string
		wantCode        connect.Code
		wantOK          bool
	}{
		{
			name:    "all adults (13+), no extra fields needed",
			ages:    []int32{13, 25, 40},
			wantOK:  true,
		},
		{
			name:    "10-12 age requires guardian and consent",
			ages:    []int32{10, 30},
			guardianName:    validGuardian,
			consentSnapshot: validConsent,
			wantOK:  true,
		},
		{
			name:    "7-9 age requires paper_form_id, guardian, and consent",
			ages:    []int32{8, 35},
			paperFormID:     validPaperForm,
			guardianName:    validGuardian,
			consentSnapshot: validConsent,
			wantOK:  true,
		},
		{
			name:    "under 7 is rejected",
			ages:    []int32{6, 30},
			wantOK:  false,
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name:    "age 0 is rejected",
			ages:    []int32{0},
			wantOK:  false,
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name:    "exactly 7 requires paper_form_id and guardian",
			ages:    []int32{7},
			paperFormID:     validPaperForm,
			guardianName:    validGuardian,
			consentSnapshot: validConsent,
			wantOK:  true,
		},
		{
			name:    "7-9 without paper_form_id is rejected",
			ages:    []int32{9, 35},
			guardianName:    validGuardian,
			consentSnapshot: validConsent,
			wantOK:  false,
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name:    "under 13 without guardian_name is rejected",
			ages:    []int32{11},
			consentSnapshot: validConsent,
			wantOK:  false,
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name:    "under 13 without consent_text_snapshot is rejected",
			ages:    []int32{12},
			guardianName: validGuardian,
			wantOK:  false,
			wantCode: connect.CodeInvalidArgument,
		},
		{
			name:    "exactly 13 does not require guardian or consent",
			ages:    []int32{13},
			wantOK:  true,
		},
		{
			name:    "mixed group: 8 and 14 requires paper_form_id, guardian, consent",
			ages:    []int32{8, 14},
			paperFormID:     validPaperForm,
			guardianName:    validGuardian,
			consentSnapshot: validConsent,
			wantOK:  true,
		},
		{
			name:    "mixed group: 8 and 14 without paper_form_id is rejected",
			ages:    []int32{8, 14},
			guardianName:    validGuardian,
			consentSnapshot: validConsent,
			wantOK:  false,
			wantCode: connect.CodeInvalidArgument,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateManualTicketRequest(tt.ages, tt.paperFormID, tt.guardianName, tt.consentSnapshot)
			if tt.wantOK {
				if err != nil {
					t.Errorf("expected no error, got: %v", err)
				}
				return
			}
			if err == nil {
				t.Errorf("expected error with code %v, got nil", tt.wantCode)
				return
			}
			var connectErr *connect.Error
			if !isConnectError(err, &connectErr) {
				t.Errorf("expected connect.Error, got: %T %v", err, err)
				return
			}
			if connectErr.Code() != tt.wantCode {
				t.Errorf("expected code %v, got %v", tt.wantCode, connectErr.Code())
			}
		})
	}
}

func isConnectError(err error, out **connect.Error) bool {
	if e, ok := err.(*connect.Error); ok {
		*out = e
		return true
	}
	return false
}

func TestComputeAgeFlags(t *testing.T) {
	tests := []struct {
		name       string
		ages       []int32
		wantUnder7 bool
		wantUnder10 bool
		wantUnder13 bool
	}{
		{
			name:        "all adults",
			ages:        []int32{13, 25},
			wantUnder7:  false,
			wantUnder10: false,
			wantUnder13: false,
		},
		{
			name:        "exactly 7",
			ages:        []int32{7},
			wantUnder7:  false,
			wantUnder10: true,
			wantUnder13: true,
		},
		{
			name:        "age 6 sets under7",
			ages:        []int32{6},
			wantUnder7:  true,
			wantUnder10: true,
			wantUnder13: true,
		},
		{
			name:        "exactly 10 sets only under13",
			ages:        []int32{10},
			wantUnder7:  false,
			wantUnder10: false,
			wantUnder13: true,
		},
		{
			name:        "exactly 13 sets nothing",
			ages:        []int32{13},
			wantUnder7:  false,
			wantUnder10: false,
			wantUnder13: false,
		},
		{
			name:        "mixed: one 6, one 20",
			ages:        []int32{6, 20},
			wantUnder7:  true,
			wantUnder10: true,
			wantUnder13: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := computeAgeFlags(tt.ages)
			if f.hasUnder7 != tt.wantUnder7 {
				t.Errorf("hasUnder7: got %v, want %v", f.hasUnder7, tt.wantUnder7)
			}
			if f.hasUnder10 != tt.wantUnder10 {
				t.Errorf("hasUnder10: got %v, want %v", f.hasUnder10, tt.wantUnder10)
			}
			if f.hasUnder13 != tt.wantUnder13 {
				t.Errorf("hasUnder13: got %v, want %v", f.hasUnder13, tt.wantUnder13)
			}
		})
	}
}
