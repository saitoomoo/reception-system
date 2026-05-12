package notification

import "strings"

// KnownVars lists all supported template variable names.
var KnownVars = []string{
	"ニックネーム",
	"受付番号",
	"ブース名",
	"場所",
	"整理券番号",
}

// SubstituteVars replaces {{変数名}} placeholders with values from vars.
// Unknown placeholders are left as-is.
func SubstituteVars(tmpl string, vars map[string]string) string {
	result := tmpl
	for k, v := range vars {
		result = strings.ReplaceAll(result, "{{"+k+"}}", v)
	}
	return result
}
