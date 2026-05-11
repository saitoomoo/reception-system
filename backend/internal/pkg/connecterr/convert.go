package connecterr

import (
	"context"
	"errors"

	"connectrpc.com/connect"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
	ErrConflict     = errors.New("conflict")

	// Ticket domain errors.
	ErrUnderAge             = errors.New("participant under minimum age")
	ErrSpecialFlowRequired  = errors.New("special staff flow required for age 7-9")
	ErrConsentRequired      = errors.New("parental consent required for participant under 13")
	ErrAlreadyHasTicket     = errors.New("visitor already has an active ticket for this booth")
	ErrCooldownActive       = errors.New("cooldown period has not elapsed since last admission")
	ErrBoothClosed          = errors.New("booth is not accepting tickets")
	ErrBoothOutOfHours      = errors.New("booth is outside operating hours")
	ErrCancelNotAllowed     = errors.New("ticket cannot be cancelled in its current state")
)

// Convert maps domain errors to Connect error codes.
// Call this at the handler boundary before returning errors.
func Convert(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, ErrUnauthorized):
		return connect.NewError(connect.CodeUnauthenticated, err)
	case errors.Is(err, ErrForbidden):
		return connect.NewError(connect.CodePermissionDenied, err)
	case errors.Is(err, ErrConflict):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, ErrAlreadyHasTicket):
		return connect.NewError(connect.CodeAlreadyExists, err)
	case errors.Is(err, ErrUnderAge),
		errors.Is(err, ErrSpecialFlowRequired),
		errors.Is(err, ErrConsentRequired):
		return connect.NewError(connect.CodeInvalidArgument, err)
	case errors.Is(err, ErrCooldownActive),
		errors.Is(err, ErrBoothClosed),
		errors.Is(err, ErrBoothOutOfHours),
		errors.Is(err, ErrCancelNotAllowed):
		return connect.NewError(connect.CodeFailedPrecondition, err)
	case errors.Is(err, context.DeadlineExceeded):
		return connect.NewError(connect.CodeDeadlineExceeded, err)
	default:
		return connect.NewError(connect.CodeInternal, err)
	}
}
