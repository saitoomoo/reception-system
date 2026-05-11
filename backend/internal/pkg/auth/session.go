package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	staffCookieName  = "staff_session"
	adminCookieName  = "admin_session"
	sessionTTL       = 12 * time.Hour

	RoleStaff       = "staff"
	RoleGlobalAdmin = "global_admin"
)

// Session represents an authenticated session.
type Session struct {
	BoothID int64  // 0 for global admin
	Role    string // RoleStaff or RoleGlobalAdmin
}

// Sign encodes and HMAC-signs a session into a cookie value.
func Sign(s Session, secret string) string {
	expires := time.Now().Add(sessionTTL).Unix()
	payload := fmt.Sprintf("%d|%s|%d", s.BoothID, s.Role, expires)
	sig := sign(payload, secret)
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + sig
}

// Parse verifies and decodes a cookie value into a Session.
func Parse(cookie string, secret string) (*Session, error) {
	dot := strings.LastIndex(cookie, ".")
	if dot < 0 {
		return nil, errors.New("malformed session cookie")
	}
	encodedPayload := cookie[:dot]
	sig := cookie[dot+1:]

	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return nil, errors.New("malformed session cookie")
	}
	payload := string(payloadBytes)

	expected := sign(payload, secret)
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return nil, errors.New("invalid session signature")
	}

	parts := strings.Split(payload, "|")
	if len(parts) != 3 {
		return nil, errors.New("malformed session payload")
	}

	boothID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return nil, errors.New("malformed session payload")
	}
	role := parts[1]
	expires, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return nil, errors.New("malformed session payload")
	}
	if time.Now().Unix() > expires {
		return nil, errors.New("session expired")
	}

	return &Session{BoothID: boothID, Role: role}, nil
}

// SetStaffCookie adds a signed staff session cookie to the given response header.
func SetStaffCookie(h http.Header, s Session, secret string) {
	setCookie(h, staffCookieName, Sign(s, secret))
}

// SetAdminCookie adds a signed global-admin session cookie to the given response header.
func SetAdminCookie(h http.Header, s Session, secret string) {
	setCookie(h, adminCookieName, Sign(s, secret))
}

func setCookie(h http.Header, name, value string) {
	c := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
		Secure:   true,
		MaxAge:   int(sessionTTL.Seconds()),
	}
	h.Add("Set-Cookie", c.String())
}

// ParseStaffSession reads and verifies the staff session cookie from the request.
func ParseStaffSession(r *http.Request, secret string) (*Session, error) {
	c, err := r.Cookie(staffCookieName)
	if err != nil {
		return nil, errors.New("no staff session cookie")
	}
	return Parse(c.Value, secret)
}

// ParseAdminSession reads and verifies the admin session cookie from the request.
func ParseAdminSession(r *http.Request, secret string) (*Session, error) {
	c, err := r.Cookie(adminCookieName)
	if err != nil {
		return nil, errors.New("no admin session cookie")
	}
	s, err := Parse(c.Value, secret)
	if err != nil {
		return nil, err
	}
	if s.Role != RoleGlobalAdmin {
		return nil, errors.New("not a global admin session")
	}
	return s, nil
}

func sign(payload, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
