package notification

import (
	"testing"
)

func TestSubstituteVars(t *testing.T) {
	tests := []struct {
		name string
		tmpl string
		vars map[string]string
		want string
	}{
		{
			name: "all known variables substituted",
			tmpl: "{{ニックネーム}} さん、{{ブース名}} の整理券を取得しました。",
			vars: map[string]string{
				"ニックネーム": "山田",
				"ブース名":   "VR体験",
			},
			want: "山田 さん、VR体験 の整理券を取得しました。",
		},
		{
			name: "place and ticket number substituted",
			tmpl: "{{ニックネーム}} さん、{{場所}} へお越しください。整理券 {{整理券番号}}。",
			vars: map[string]string{
				"ニックネーム": "佐藤",
				"場所":     "A棟3階",
				"整理券番号":  "42",
			},
			want: "佐藤 さん、A棟3階 へお越しください。整理券 42。",
		},
		{
			name: "unknown variable left as-is",
			tmpl: "{{ニックネーム}} さん、{{存在しない変数}} をご確認ください。",
			vars: map[string]string{
				"ニックネーム": "鈴木",
			},
			want: "鈴木 さん、{{存在しない変数}} をご確認ください。",
		},
		{
			name: "no variables in template",
			tmpl: "お知らせです。",
			vars: map[string]string{"ニックネーム": "田中"},
			want: "お知らせです。",
		},
		{
			name: "empty template",
			tmpl: "",
			vars: map[string]string{"ニックネーム": "田中"},
			want: "",
		},
		{
			name: "reception number substituted",
			tmpl: "受付番号 {{受付番号}} で確認",
			vars: map[string]string{"受付番号": "A-042"},
			want: "受付番号 A-042 で確認",
		},
		{
			name: "same variable multiple times",
			tmpl: "{{ニックネーム}} さん、こんにちは {{ニックネーム}} さん。",
			vars: map[string]string{"ニックネーム": "花子"},
			want: "花子 さん、こんにちは 花子 さん。",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SubstituteVars(tt.tmpl, tt.vars)
			if got != tt.want {
				t.Errorf("SubstituteVars() = %q, want %q", got, tt.want)
			}
		})
	}
}
